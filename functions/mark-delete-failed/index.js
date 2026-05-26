const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");

exports.handler = async (input) => {
  const error = input.failure?.Cause || input.error || "Video deletion failed";
  await updateVideoStatus(input.videoId, "DELETE_FAILED", { deleteFailure: String(error) });
  await appendProcessingEvent(input.videoId, "VIDEO_DELETE_FAILED", String(error), "failed");
  await publish("VIDEO_DELETE_FAILED", {
    videoId: input.videoId,
    userId: input.userId,
    error: String(error)
  });
  return { ...input, status: "DELETE_FAILED" };
};

