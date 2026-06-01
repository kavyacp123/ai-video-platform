const { followUser, unfollowUser, createAuditLog } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const { targetUserId } = event.pathParameters;
    const httpMethod = event.requestContext.http.method;
    const userId = event.requestContext.authorizer.principalId;

    if (userId === targetUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Cannot follow yourself" })
      };
    }

    if (httpMethod === "POST") {
      await followUser({ userId, targetUserId });

      await createAuditLog({
        userId,
        action: "FOLLOW_USER",
        resource: "user",
        resourceId: targetUserId,
        status: "success",
        details: {}
      });

      logger.info("User followed", { userId, targetUserId });

      return {
        statusCode: 201,
        body: JSON.stringify({
          userId,
          targetUserId,
          action: "followed",
          timestamp: new Date().toISOString()
        })
      };
    } else {
      await unfollowUser({ userId, targetUserId });

      await createAuditLog({
        userId,
        action: "UNFOLLOW_USER",
        resource: "user",
        resourceId: targetUserId,
        status: "success",
        details: {}
      });

      logger.info("User unfollowed", { userId, targetUserId });

      return {
        statusCode: 200,
        body: JSON.stringify({
          userId,
          targetUserId,
          action: "unfollowed",
          timestamp: new Date().toISOString()
        })
      };
    }
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Already following this user" })
      };
    }
    logger.error("Error following user", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to follow user" })
    };
  }
};
