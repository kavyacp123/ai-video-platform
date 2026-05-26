const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES } = require("../../shared/constants");

exports.handler = async (input) => {
  if (!input.plan.generateThumbnail) return { ...input, thumbnailSkipped: true };

  const thumbnailUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/thumbnails/${input.videoId}/poster.jpg`;
  await updateVideoStatus(input.videoId, "PROCESSING", { thumbnailUrl });
  await appendProcessingEvent(input.videoId, EVENT_TYPES.THUMBNAIL_READY, "Thumbnail skeleton completed.");
  await publish(EVENT_TYPES.THUMBNAIL_READY, {
    videoId: input.videoId,
    userId: input.userId,
    thumbnailUrl
  });
  return { ...input, thumbnailUrl };
};

