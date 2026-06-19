const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");

exports.handler = async (input) => {
  const outputs = Array.isArray(input.pipelineResults) ? input.pipelineResults : [];
  const moderation = outputs.find((output) => output?.moderation)?.moderation;
  const transcode = outputs.find((output) => output?.hls || output?.hlsS3Key || output?.hlsKeys) || {};
  const hlsS3Key = transcode.hls?.master || transcode.hlsS3Key || `${input.videoId}/master.m3u8`;
  const playbackUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${hlsS3Key}`;

  if (moderation?.decision === "REVIEW") {
    await appendProcessingEvent(input.videoId, "AGGREGATE_RESULTS", "Video requires moderation review before playback.");
    return { ...input, status: VIDEO_STATUS.REVIEW_REQUIRED, moderation };
  }

  const thumbnailKey = transcode.thumbnail;
  const thumbnailUrl = thumbnailKey ? `https://${process.env.CLOUDFRONT_DOMAIN}/${thumbnailKey}` : undefined;

  const updateFields = {
    playbackUrl,
    hlsS3Key
  };
  if (thumbnailUrl) updateFields.thumbnailUrl = thumbnailUrl;

  await updateVideoStatus(input.videoId, VIDEO_STATUS.READY, updateFields);
  await appendProcessingEvent(input.videoId, "AGGREGATE_RESULTS", "All enabled branches completed.");
  await publish(EVENT_TYPES.VIDEO_READY, { videoId: input.videoId, userId: input.userId, playbackUrl });
  return { ...input, status: VIDEO_STATUS.READY, playbackUrl };
};
