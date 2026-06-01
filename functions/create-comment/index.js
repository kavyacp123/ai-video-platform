const { v4: uuidv4 } = require("uuid");
const { createComment, createAuditLog } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const { text } = JSON.parse(event.body || "{}");
    const userId = event.requestContext.authorizer.principalId;

    if (!text || text.trim().length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Comment text is required" })
      };
    }

    if (text.length > 1000) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Comment exceeds 1000 characters" })
      };
    }

    const commentId = uuidv4();

    await createComment({
      videoId,
      userId,
      commentId,
      text: text.trim(),
      userName: event.requestContext.authorizer.claims?.["cognito:username"] || "Anonymous"
    });

    await createAuditLog({
      userId,
      action: "CREATE_COMMENT",
      resource: "comment",
      resourceId: commentId,
      status: "success",
      details: { videoId, commentLength: text.length }
    });

    logger.info("Comment created", {
      videoId,
      commentId,
      userId
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        commentId,
        videoId,
        userId,
        text,
        createdAt: new Date().toISOString()
      })
    };
  } catch (error) {
    logger.error("Error creating comment", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create comment" })
    };
  }
};
