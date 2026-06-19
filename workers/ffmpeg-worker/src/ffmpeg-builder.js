"use strict";

const path = require("path");

/**
 * Builds the single FFmpeg command that decodes the input video exactly ONCE
 * and produces all artifacts in parallel via -filter_complex stream splitting.
 *
 * Outputs produced:
 *   720p HLS   → <outputRoot>/720p/index.m3u8 + *.ts
 *   480p HLS   → <outputRoot>/480p/index.m3u8 + *.ts
 *   360p HLS   → <outputRoot>/360p/index.m3u8 + *.ts
 *   master     → <outputRoot>/master.m3u8      (written in JS, not by FFmpeg)
 *   Thumbnail  → <outputRoot>/thumbnails/<videoId>/poster.jpg
 *   Frames     → <outputRoot>/frames/frame-%03d.jpg  (1 per 30 s)
 *   Clip       → <outputRoot>/clips/<videoId>/highlight-1.mp4  (0-15 s)
 *
 * @param {object} opts
 * @param {string}   opts.inputPath       Absolute path to the downloaded video.
 * @param {string}   opts.outputRoot      Absolute path to a writable temp directory.
 * @param {string}   opts.videoId
 * @param {string[]} opts.resolutions     e.g. ["720p","480p","360p"]
 * @param {boolean}  opts.generateThumbnail
 * @param {boolean}  opts.generateFrames
 * @param {boolean}  opts.generateClip
 * @param {object[]} [opts.clips]         [{startSeconds, endSeconds}] – only first is used.
 * @returns {{ args: string[], outputMap: object }}
 */
function buildSinglePassCommand(opts) {
  const {
    inputPath,
    outputRoot,
    videoId,
    resolutions = ["720p", "480p", "360p"],
    generateThumbnail = true,
    generateFrames = true,
    generateClip = true,
    clips = [],
  } = opts;

  const resConfig = {
    "720p": { w: 1280, h: 720, bv: "2500k", ba: "192k" },
    "480p": { w: 854,  h: 480, bv: "1000k", ba: "128k" },
    "360p": { w: 640,  h: 360, bv: "600k",  ba: "96k"  },
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Count how many split branches we need.
  // ────────────────────────────────────────────────────────────────────────────
  const branchCount =
    resolutions.length +
    (generateThumbnail ? 1 : 0) +
    (generateFrames    ? 1 : 0) +
    (generateClip      ? 1 : 0);

  // Labels for each split output: [v0] [v1] [v2] [vthumb] [vframes] [vclip]
  const resLabels   = resolutions.map((_, i) => `v${i}`);
  const thumbLabel  = "vthumb";
  const framesLabel = "vframes";
  const clipLabel   = "vclip";

  const splitLabels = [
    ...resLabels,
    ...(generateThumbnail ? [thumbLabel]  : []),
    ...(generateFrames    ? [framesLabel] : []),
    ...(generateClip      ? [clipLabel]   : []),
  ];

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Build filter_complex string.
  // ────────────────────────────────────────────────────────────────────────────
  const filterParts = [];

  // split=N → N labelled branches from the single decoded video stream
  filterParts.push(
    `[0:v]split=${branchCount}${splitLabels.map((l) => `[${l}]`).join("")}`
  );

  // Scale each HLS resolution
  resLabels.forEach((lbl, i) => {
    const r   = resolutions[i];
    const cfg = resConfig[r] || resConfig["480p"];
    filterParts.push(`[${lbl}]scale=${cfg.w}:${cfg.h}[out${r}]`);
  });

  // Thumbnail: pick frame nearest to t=1s to avoid black-frames, output single JPEG
  if (generateThumbnail) {
    filterParts.push(
      `[${thumbLabel}]trim=start=1:end=2,setpts=PTS-STARTPTS,select=eq(n\\,0)[outthumb]`
    );
  }

  // Frame extraction: 1 frame per 30 seconds for AI moderation
  if (generateFrames) {
    filterParts.push(`[${framesLabel}]fps=1/30[outframes]`);
  }

  // Clip: trim to 0-15 s (or AI-specified timestamps from first clip entry)
  if (generateClip) {
    const clipStart = clips?.[0]?.startSeconds ?? 0;
    const clipEnd   = clips?.[0]?.endSeconds   ?? 15;
    filterParts.push(
      `[${clipLabel}]trim=start=${clipStart}:end=${clipEnd},setpts=PTS-STARTPTS[outclip]`
    );
  }

  const filterComplex = filterParts.join(";");

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Assemble -map / output pairs.
  // ────────────────────────────────────────────────────────────────────────────
  const args = ["-y", "-i", inputPath, "-filter_complex", filterComplex];

  const outputMap = {};

  // HLS outputs
  resolutions.forEach((r) => {
    const cfg     = resConfig[r] || resConfig["480p"];
    const hlsDir  = path.join(outputRoot, r);
    const hlsPath = path.join(hlsDir, "index.m3u8");
    outputMap[r] = hlsPath;

    args.push(
      "-map", `[out${r}]`,
      "-map", "0:a?",           // carry audio if present
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-b:v", cfg.bv,
      "-c:a", "aac",
      "-b:a", cfg.ba,
      "-ar", "44100",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", path.join(hlsDir, "seg%03d.ts"),
      hlsPath
    );
  });

  // Thumbnail output
  if (generateThumbnail) {
    const thumbPath = path.join(outputRoot, "thumbnails", videoId, "poster.jpg");
    outputMap.thumbnail = thumbPath;
    args.push(
      "-map", "[outthumb]",
      "-frames:v", "1",
      "-q:v", "2",
      thumbPath
    );
  }

  // Frame extraction output
  if (generateFrames) {
    const framePath = path.join(outputRoot, "frames", "frame-%03d.jpg");
    outputMap.frames = framePath;
    args.push(
      "-map", "[outframes]",
      "-q:v", "3",
      framePath
    );
  }

  // Clip output
  if (generateClip) {
    const clipPath = path.join(outputRoot, "clips", videoId, "highlight-1.mp4");
    outputMap.clip = clipPath;
    args.push(
      "-map", "[outclip]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "fast",
      "-c:a", "aac",
      clipPath
    );
  }

  return { args, outputMap };
}

module.exports = { buildSinglePassCommand };
