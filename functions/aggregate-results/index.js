const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");

exports.handler = async (input) => {
  const playbackUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/hls/${input.videoId}/master.m3u8`;
  await updateVideoStatus(input.videoId, VIDEO_STATUS.READY, {
    playbackUrl,
    hlsS3Key: `hls/${input.videoId}/master.m3u8`
  });
  await appendProcessingEvent(input.videoId, "AGGREGATE_RESULTS", "All enabled branches completed.");
  await publish(EVENT_TYPES.VIDEO_READY, { videoId: input.videoId, userId: input.userId, playbackUrl });
  return { ...input, status: VIDEO_STATUS.READY, playbackUrl };
};

