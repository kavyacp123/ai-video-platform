"use strict";

// ─── Core Node.js ────────────────────────────────────────────────────────────
const { spawn }                          = require("child_process");
const { createWriteStream }              = require("fs");
const { mkdir, rm, readdir, writeFile }  = require("fs/promises");
const path                               = require("path");
const { pipeline }                       = require("stream/promises");
const { randomUUID }                     = require("crypto");

// ─── AWS SDK ──────────────────────────────────────────────────────────────────
const { S3Client, GetObjectCommand }                = require("@aws-sdk/client-s3");
const { SQSClient, ReceiveMessageCommand,
        DeleteMessageCommand,
        ChangeMessageVisibilityCommand }            = require("@aws-sdk/client-sqs");
const { SFNClient, SendTaskSuccessCommand,
        SendTaskFailureCommand }                    = require("@aws-sdk/client-sfn");

// ─── Internal modules ─────────────────────────────────────────────────────────
const { Logger }               = require("./src/logger");
const { emitMetric }           = require("./src/metrics");
const { buildSinglePassCommand }= require("./src/ffmpeg-builder");
const { uploadHls, uploadThumbnail,
        uploadFrames, uploadClip }        = require("./src/uploader");
const { buildManifest }        = require("./src/manifest");

// ─── Clients ──────────────────────────────────────────────────────────────────
const s3  = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const sfn = new SFNClient({ region: process.env.AWS_REGION || "ap-south-1" });

const QUEUE_URL          = process.env.TRANSCODE_QUEUE_URL;
const PROCESSED_BUCKET   = process.env.PROCESSED_BUCKET_NAME;
const THUMBNAIL_BUCKET   = process.env.THUMBNAIL_BUCKET_NAME || process.env.PROCESSED_BUCKET_NAME;
const WORKER_VERSION     = "2.0.0";

// ─── Graceful shutdown tracking ───────────────────────────────────────────────
let shuttingDown = false;
let activeJobs   = 0;
const activeReceipts = new Set();

process.on("SIGTERM", () => {
  shuttingDown = true;
});

// ─── Root logger ─────────────────────────────────────────────────────────────
const rootLog = new Logger({ workerVersion: WORKER_VERSION });

// ─────────────────────────────────────────────────────────────────────────────
// MAIN POLL LOOP
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  rootLog.info("ffmpeg worker started", { queueUrl: QUEUE_URL, workerVersion: WORKER_VERSION });

  while (!shuttingDown) {
    const resp = await sqs.send(new ReceiveMessageCommand({
      QueueUrl:            QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds:     20,
      VisibilityTimeout:   7200,  // 2 h – covers the longest possible transcode
    }));

    for (const message of resp.Messages || []) {
      activeJobs++;
      activeReceipts.add(message.ReceiptHandle);
      handleMessage(message)            // intentionally NOT awaited – process concurrently
        .catch((err) => rootLog.error("unhandled handleMessage error", { error: err.message }))
        .finally(() => {
          activeReceipts.delete(message.ReceiptHandle);
          activeJobs--;
        });
    }
  }

  // ── Graceful drain ────────────────────────────────────────────────────────
  rootLog.info("SIGTERM received, draining active jobs", { activeJobs });
  const deadline = Date.now() + 100_000; // 100 s (Fargate gives 120 s after SIGTERM)
  while (activeJobs > 0 && Date.now() < deadline) {
    await sleep(1000);
  }
  if (activeJobs > 0) {
    rootLog.warn("deadline reached before drain, returning messages", { activeJobs });
    for (const receipt of activeReceipts) {
      await sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl:          QUEUE_URL,
        ReceiptHandle:     receipt,
        VisibilityTimeout: 0,
      })).catch(() => {});
    }
  }
  rootLog.info("worker shut down gracefully");
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleMessage(message) {
  const job = JSON.parse(message.Body);

  // Validate no path traversal
  if (!isSafeId(job.videoId)) {
    rootLog.error("unsafe videoId rejected", { videoId: job.videoId });
    await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: message.ReceiptHandle }));
    return;
  }

  const processingId = randomUUID();
  const log = new Logger({ processingId, videoId: job.videoId, stage: "INIT" });
  const t0  = Date.now();

  log.info("job received", {
    jobType: job.jobType,
    sourceBucket: job.sourceBucket,
    s3Key: job.s3Key,
  });

  try {
    const manifest = await processJob(job, processingId, log);

    log.info("job succeeded", { durationMs: Date.now() - t0 });

    // Notify Step Functions
    await sfn.send(new SendTaskSuccessCommand({
      taskToken: job.taskToken,
      output:    JSON.stringify(manifest),
    }));

    // Delete the message only after a successful task callback
    await sqs.send(new DeleteMessageCommand({
      QueueUrl:      QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle,
    }));

    await emitMetric("VideoProcessedCount", 1,               "Count",        { VideoId: job.videoId });
    await emitMetric("ProcessingDuration",  Date.now() - t0, "Milliseconds", { VideoId: job.videoId });

  } catch (err) {
    log.error("job failed – sending task failure", {
      error:      err.message,
      durationMs: Date.now() - t0,
    });

    if (job.taskToken) {
      await sfn.send(new SendTaskFailureCommand({
        taskToken: job.taskToken,
        error:     "FFMPEG_WORKER_FAILED",
        cause:     err.message.slice(0, 256), // SFN cause limit
      })).catch(() => {});
    }

    await emitMetric("ProcessingFailures", 1, "Count", { VideoId: job.videoId });
  } finally {
    await cleanup(job.videoId, log);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SINGLE-PASS PROCESSING
// ─────────────────────────────────────────────────────────────────────────────
async function processJob(job, processingId, log) {
  const videoId    = job.videoId;
  const outputRoot = `/tmp/${videoId}`;
  const inputPath  = `/tmp/${videoId}.mp4`;

  const resolutions       = job.resolutions || ["720p", "480p", "360p"];
  const generateThumbnail = job.generateThumbnail !== false;
  const generateFrames    = job.generateFrames    !== false;
  const generateClip      = job.generateClip      !== false;
  const clips             = job.clips             || [];

  const errors = [];   // non-critical failures accumulate here

  // ── 1. Create directory tree ─────────────────────────────────────────────
  await log.timed("CREATE_DIRS", async () => {
    await mkdir(outputRoot, { recursive: true });
    for (const r of resolutions) await mkdir(path.join(outputRoot, r), { recursive: true });
    if (generateThumbnail) await mkdir(path.join(outputRoot, "thumbnails", videoId), { recursive: true });
    if (generateFrames)    await mkdir(path.join(outputRoot, "frames"),                { recursive: true });
    if (generateClip)      await mkdir(path.join(outputRoot, "clips", videoId),        { recursive: true });
  });

  // ── 2. Download the raw video exactly once ───────────────────────────────
  await log.timed("S3_DOWNLOAD", async () => {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: job.sourceBucket,
      Key:    job.s3Key,
    }));
    await pipeline(resp.Body, createWriteStream(inputPath));
  });

  // ── 3. Get FFmpeg version for the manifest ───────────────────────────────
  const ffmpegVersion = await getFfmpegVersion().catch(() => "unknown");

  // ── 4. Build single FFmpeg command via -filter_complex ───────────────────
  const { args } = buildSinglePassCommand({
    inputPath,
    outputRoot,
    videoId,
    resolutions,
    generateThumbnail,
    generateFrames,
    generateClip,
    clips,
  });

  // ── 5. Run FFmpeg EXACTLY ONCE ───────────────────────────────────────────
  await log.timed("FFMPEG_SINGLE_PASS", () => runFfmpeg(args, log));

  // ── 6. Write master HLS playlist ────────────────────────────────────────
  await log.timed("MASTER_PLAYLIST", async () => {
    const lines = ["#EXTM3U"];
    const bwMap = { "720p": 2500000, "480p": 1000000, "360p": 600000 };
    const resMap = { "720p": "1280x720", "480p": "854x480", "360p": "640x360" };
    for (const r of resolutions) {
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bwMap[r] || 1000000},RESOLUTION=${resMap[r] || "854x480"}`,
        `${r}/index.m3u8`
      );
    }
    await writeFile(path.join(outputRoot, "master.m3u8"), lines.join("\n"));
  });

  // ─── 7. Incremental uploads (artifact-by-artifact) ───────────────────────

  // 7a. HLS – CRITICAL, throws on failure
  const hlsKeys = await log.timed("UPLOAD_HLS", () =>
    uploadHls(outputRoot, PROCESSED_BUCKET, videoId, resolutions, log)
  );

  // 7b. Master playlist – CRITICAL
  await log.timed("UPLOAD_MASTER", () =>
    uploadSingleFile(
      PROCESSED_BUCKET,
      `${videoId}/master.m3u8`,
      path.join(outputRoot, "master.m3u8"),
      log
    )
  );

  const hlsManifest = {
    master: `${videoId}/master.m3u8`,
    ...hlsKeys,
  };

  // 7c. Thumbnail – NON-CRITICAL
  let thumbnailKey = null;
  if (generateThumbnail) {
    try {
      thumbnailKey = await log.timed("UPLOAD_THUMBNAIL", () =>
        uploadThumbnail(outputRoot, THUMBNAIL_BUCKET, videoId, log)
      );
    } catch (err) {
      log.warn("thumbnail upload failed (non-critical)", { error: err.message });
      errors.push(`THUMBNAIL_UPLOAD: ${err.message}`);
      await emitMetric("UploadFailures", 1, "Count", { ArtifactType: "thumbnail" });
    }
  }

  // 7d. Frames – NON-CRITICAL
  let frameKeys = [];
  if (generateFrames) {
    try {
      frameKeys = await log.timed("UPLOAD_FRAMES", () =>
        uploadFrames(outputRoot, THUMBNAIL_BUCKET, videoId, log)
      );
    } catch (err) {
      log.warn("frames upload failed (non-critical)", { error: err.message });
      errors.push(`FRAMES_UPLOAD: ${err.message}`);
      await emitMetric("UploadFailures", 1, "Count", { ArtifactType: "frames" });
    }
  }

  // 7e. Clip – NON-CRITICAL
  let clipKey = null;
  if (generateClip) {
    try {
      clipKey = await log.timed("UPLOAD_CLIP", () =>
        uploadClip(outputRoot, PROCESSED_BUCKET, videoId, log)
      );
    } catch (err) {
      log.warn("clip upload failed (non-critical)", { error: err.message });
      errors.push(`CLIP_UPLOAD: ${err.message}`);
      await emitMetric("UploadFailures", 1, "Count", { ArtifactType: "clip" });
    }
  }

  // ── 8. Build final manifest ──────────────────────────────────────────────
  const manifest = buildManifest({
    processingId,
    videoId,
    status:    errors.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
    hls:       hlsManifest,
    thumbnail: thumbnailKey,
    frames:    frameKeys,
    clips:     clipKey ? [{ title: "Auto highlight", s3Key: clipKey }] : [],
    errors,
    metadata: {
      ffmpegVersion,
      workerVersion: WORKER_VERSION,
    },
  });

  log.info("manifest built", { status: manifest.status, errorCount: errors.length });
  return manifest;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spawn FFmpeg and stream its stderr to the logger.
 * This is the ONE place in the entire codebase where FFmpeg is invoked.
 */
function runFfmpeg(args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderrBuffer = "";
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      // Emit only progress lines to avoid mega-log entries
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop();
      for (const line of lines) {
        if (line.includes("frame=") || line.includes("speed=")) {
          log.info("ffmpeg progress", { stage: "FFMPEG_SINGLE_PASS", line: line.trim() });
        }
      }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}. Tail: ${stderrBuffer.slice(-500)}`));
      }
    });
  });
}

/** Upload a single small file using the SDK PutObject. */
async function uploadSingleFile(bucket, key, filePath, log) {
  const { S3Client: _S3Client, PutObjectCommand: _Put } = require("@aws-sdk/client-s3");
  const fs2 = require("fs");
  await s3.send(new (require("@aws-sdk/client-s3").PutObjectCommand)({
    Bucket:      bucket,
    Key:         key,
    Body:        fs2.createReadStream(filePath),
    ContentType: "application/vnd.apple.mpegurl",
  }));
  log.info("master playlist uploaded", { key });
}

/** Get the FFmpeg version string. */
function getFfmpegVersion() {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("exit", () => resolve(out.split("\n")[0] || "unknown"));
    child.on("error", reject);
  });
}

/** Validate videoId has no path traversal characters. */
function isSafeId(id) {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

/** Clean up all temporary files for a video. */
async function cleanup(videoId, log) {
  try {
    await rm(`/tmp/${videoId}`,     { recursive: true, force: true });
    await rm(`/tmp/${videoId}.mp4`, { force: true });
    log.info("cleanup complete", { stage: "CLEANUP" });
  } catch (err) {
    log.warn("cleanup failed (non-critical)", { stage: "CLEANUP", error: err.message });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
main().catch((err) => {
  rootLog.error("fatal main loop error", { error: err.message, stack: err.stack });
  process.exit(1);
});
