const RENDITION_PRESETS = {
  "1080p": { width: 1920, height: 1080, videoBitrate: "6000k", audioBitrate: "192k", bandwidth: 6500000 },
  "720p": { width: 1280, height: 720, videoBitrate: "4500k", audioBitrate: "192k", bandwidth: 5000000 },
  "480p": { width: 854, height: 480, videoBitrate: "2000k", audioBitrate: "128k", bandwidth: 2400000 },
  "360p": { width: 640, height: 360, videoBitrate: "800k", audioBitrate: "96k", bandwidth: 1000000 }
};

function createRenditionJobs({ videoId, userId, sourceBucket, sourceKey, outputBucket, outputPrefix, resolutions }) {
  return resolutions.map((resolution) => {
    const preset = RENDITION_PRESETS[resolution] || RENDITION_PRESETS["480p"];
    return {
      jobType: "RENDITION_TRANSCODE",
      videoId,
      userId,
      resolution,
      sourceBucket,
      sourceKey,
      outputBucket,
      outputPrefix: `${outputPrefix}/${resolution}`,
      playlistKey: `${outputPrefix}/${resolution}/index.m3u8`,
      segmentPattern: "segment_%05d.ts",
      preset
    };
  });
}

function buildMasterManifest(renditions) {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];

  for (const rendition of renditions) {
    const preset = RENDITION_PRESETS[rendition.resolution] || rendition.preset;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${preset.bandwidth},RESOLUTION=${preset.width}x${preset.height}`,
      `${rendition.resolution}/index.m3u8`
    );
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  RENDITION_PRESETS,
  createRenditionJobs,
  buildMasterManifest
};

