const { rateVideo, createAuditLog } = require("../../shared/dynamoService.js");
const logger = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const { rating } = JSON.parse(event.body || "{}");
    const userId = event.requestContext.authorizer.principalId;

    if (!rating || rating < 1 || rating > 5) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Rating must be between 1 and 5" })
      };
    }

    await rateVideo({ videoId, userId, rating });

    await createAuditLog({
      userId,
      action: "RATE_VIDEO",
      resource: "video",
      resourceId: videoId,
      status: "success",
      details: { rating }
    });

    logger.info("Video rated", { videoId, userId, rating });

    return {
      statusCode: 201,
      body: JSON.stringify({
        videoId,
        userId,
        rating,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    logger.error("Error rating video", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to rate video" })
    };
  }
};
