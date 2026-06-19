const { trackEngagementEvent, createAuditLog } = require("../../shared/dynamoService.js");
const logger = require("../../shared/logger.js");

const ALLOWED_EVENTS = ["play", "pause", "skip", "replay", "seek", "quality_change"];

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const { eventType, position, metadata } = JSON.parse(event.body || "{}");
    const userId = event.requestContext.authorizer.principalId;

    if (!ALLOWED_EVENTS.includes(eventType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid eventType. Allowed: ${ALLOWED_EVENTS.join(", ")}` })
      };
    }

    await trackEngagementEvent({
      videoId,
      userId,
      eventType,
      position: position || 0,
      metadata: metadata || {}
    });

    logger.info("Engagement event tracked", { videoId, userId, eventType, position });

    return {
      statusCode: 201,
      body: JSON.stringify({
        videoId,
        eventType,
        tracked: true
      })
    };
  } catch (error) {
    logger.error("Error tracking engagement", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to track engagement event" })
    };
  }
};
