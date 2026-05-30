const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");

/**
 * Handles Step Functions pipeline failures
 *
 * Centralized error handler for video processing pipeline.
 * Updates video status to FAILED and publishes VIDEO_FAILED event.
 * Allows downstream services to react to processing failures.
 *
 * Called from Step Functions Catch block.
 *
 * @param {Object} input - Step Functions execution state
 * @param {string} input.videoId - Video ID (from current execution)
 * @param {string} input.userId - User ID
 * @param {string} input.stage - Pipeline stage where failure occurred
 * @param {string} input.error - Error message
 * @param {string} input.Cause - Alternative error source (from Step Functions catch)
 *
 * @returns {Object} {...input, handled: true}
 *
 * Effects:
 * - Video status set to FAILED
 * - Processing event logged with error
 * - VIDEO_FAILED event published (for notifications, analytics, cleanup)
 * - Silent fail if video ID not available (prevents cascading failures)
 *
 * Example Step Functions Catch:
 * "Catch": [{
 *   "ErrorEquals": ["States.ALL"],
 *   "ResultPath": "$.error",
 *   "Next": "HandleFailure"
 * }]
 */
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

