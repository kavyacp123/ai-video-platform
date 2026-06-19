const { likeVideo, unlikeVideo, createAuditLog } = require("../../shared/dynamoService.js");
const logger = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const httpMethod = event.requestContext.http.method;
    const userId = event.requestContext.authorizer.principalId;
    const action = httpMethod === "POST" ? "like" : "unlike";

    if (action === "like") {
      await likeVideo({ videoId, userId });

      await createAuditLog({
        userId,
        action: "LIKE_VIDEO",
        resource: "video",
        resourceId: videoId,
        status: "success",
        details: {}
      });

      logger.info("Video liked", { videoId, userId });

      return {
        statusCode: 201,
        body: JSON.stringify({ videoId, userId, action: "liked", timestamp: new Date().toISOString() })
      };
    } else {
      await unlikeVideo({ videoId, userId });

      await createAuditLog({
        userId,
        action: "UNLIKE_VIDEO",
        resource: "video",
        resourceId: videoId,
        status: "success",
        details: {}
      });

      logger.info("Video unliked", { videoId, userId });

      return {
        statusCode: 200,
        body: JSON.stringify({ videoId, userId, action: "unliked", timestamp: new Date().toISOString() })
      };
    }
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Already liked" })
      };
    }
    logger.error("Error liking video", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to like video" })
    };
  }
};
