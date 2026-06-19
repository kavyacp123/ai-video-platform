"use strict";

/**
 * Build the final artifact manifest returned to Step Functions via SendTaskSuccess.
 *
 * @param {object} p
 * @param {string}   p.processingId
 * @param {string}   p.videoId
 * @param {string}   p.status        "SUCCESS" | "PARTIAL_SUCCESS"
 * @param {object}   [p.hls]         { master, "720p", "480p", "360p" }
 * @param {string}   [p.thumbnail]   S3 key
 * @param {string[]} [p.frames]      S3 keys
 * @param {object[]} [p.clips]       [{ title, s3Key }]
 * @param {string[]} [p.errors]      Non-critical error messages
 * @param {object}   [p.metadata]    { duration, width, height, ffmpegVersion, workerVersion }
 */
function buildManifest(p) {
  return {
    processingId:    p.processingId,
    videoId:         p.videoId,
    status:          p.status || "SUCCESS",
    hls:             p.hls    || null,
    thumbnail:       p.thumbnail || null,
    frames:          p.frames   || [],
    clips:           p.clips    || [],
    errors:          p.errors   || [],
    metadata: {
      duration:       p.metadata?.duration        ?? 0,
      width:          p.metadata?.width           ?? 0,
      height:         p.metadata?.height          ?? 0,
      ffmpegVersion:  p.metadata?.ffmpegVersion   || "",
      workerVersion:  process.env.WORKER_VERSION  || "1.0.0",
    },
    completedAt: new Date().toISOString(),
  };
}

module.exports = { buildManifest };
