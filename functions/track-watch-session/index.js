const { trackWatchSession, createAuditLog } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const { startTime, position, duration } = JSON.parse(event.body || "{}");
    const userId = event.requestContext.authorizer.principalId;
    const sessionId = uuidv4();

    if (!startTime || !duration) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "startTime and duration are required" })
      };
    }

    await trackWatchSession({
      videoId,
      userId,
      sessionId,
      startTime,
      position: position || 0,
      duration
    });

    await createAuditLog({
      userId,
      action: "WATCH_VIDEO",
      resource: "video",
      resourceId: videoId,
      status: "success",
      details: { duration }
    });

    logger.info("Watch session tracked", { videoId, userId, sessionId, duration });

    return {
      statusCode: 201,
      body: JSON.stringify({
        videoId,
        sessionId,
        userId,
        tracked: true
      })
    };
  } catch (error) {
    logger.error("Error tracking watch session", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to track watch session" })
    };
  }
};
