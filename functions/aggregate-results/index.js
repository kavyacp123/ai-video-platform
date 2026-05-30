const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");

exports.handler = async (input) => {
  const outputs = Array.isArray(input.pipelineResults) ? input.pipelineResults : [];
  const moderation = outputs.find((output) => output?.moderation)?.moderation;
  const transcode = outputs.find((output) => output?.hlsS3Key || output?.hlsKeys) || {};
  const hlsS3Key = transcode.hlsS3Key || `hls/${input.videoId}/master.m3u8`;
  const playbackUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${hlsS3Key}`;

  if (moderation?.decision === "REVIEW") {
    await appendProcessingEvent(input.videoId, "AGGREGATE_RESULTS", "Video requires moderation review before playback.");
    return { ...input, status: VIDEO_STATUS.REVIEW_REQUIRED, moderation };
  }

  await updateVideoStatus(input.videoId, VIDEO_STATUS.READY, {
    playbackUrl,
    hlsS3Key
  });
  await appendProcessingEvent(input.videoId, "AGGREGATE_RESULTS", "All enabled branches completed.");
  await publish(EVENT_TYPES.VIDEO_READY, { videoId: input.videoId, userId: input.userId, playbackUrl });
  return { ...input, status: VIDEO_STATUS.READY, playbackUrl };
};
