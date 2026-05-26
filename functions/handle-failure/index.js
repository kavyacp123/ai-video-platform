const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");

exports.handler = async (input) => {
  const videoId = input.videoId || input.Cause?.videoId;
  const message = input.error || input.Cause || "Pipeline failed";
  if (videoId) {
    await updateVideoStatus(videoId, VIDEO_STATUS.FAILED, { failure: message });
    await appendProcessingEvent(videoId, EVENT_TYPES.VIDEO_FAILED, String(message), "failed");
    await publish(EVENT_TYPES.VIDEO_FAILED, {
      videoId,
      userId: input.userId,
      stage: input.stage || "PIPELINE",
      error: String(message),
      retryable: false
    });
  }
  return { ...input, handled: true };
};

