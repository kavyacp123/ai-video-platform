const { createViolationReport, createAuditLog } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");

const ALLOWED_REASONS = [
  "copyright",
  "hate_speech",
  "violent_content",
  "spam",
  "misinformation",
  "sexual_content",
  "other"
];

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const { reason, description } = JSON.parse(event.body || "{}");
    const reporterUserId = event.requestContext.authorizer.principalId;

    if (!ALLOWED_REASONS.includes(reason)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(", ")}`
        })
      };
    }

    if (!description || description.trim().length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Description is required" })
      };
    }

    if (description.length > 500) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Description exceeds 500 characters" })
      };
    }

    const reportId = await createViolationReport({
      videoId,
      userId: null,
      reporterUserId,
      reason,
      description: description.trim()
    });

    await createAuditLog({
      userId: reporterUserId,
      action: "CREATE_VIOLATION_REPORT",
      resource: "video",
      resourceId: videoId,
      status: "success",
      details: { reason, reportId }
    });

    logger.info("Violation report created", {
      videoId,
      reportId,
      reporterUserId,
      reason
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        reportId,
        videoId,
        status: "pending",
        createdAt: new Date().toISOString()
      })
    };
  } catch (error) {
    logger.error("Error creating violation report", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create report" })
    };
  }
};
