const { getAuditLogs, getUserPermission } = require("../../shared/dynamoService.js");
const logger = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.principalId;

    // Check admin permission
    const permission = await getUserPermission(userId);
    if (permission.role !== "admin") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Insufficient permissions" })
      };
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || 100), 500);
    const lastKey = event.queryStringParameters?.lastKey ? JSON.parse(event.queryStringParameters.lastKey) : undefined;
    const targetUserId = event.queryStringParameters?.userId;

    if (!targetUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId query parameter required" })
      };
    }

    const result = await getAuditLogs(targetUserId, limit, lastKey);

    logger.info("Audit logs retrieved", { admin: userId, targetUserId, count: result.items.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        auditLogs: result.items,
        lastKey: result.lastKey
      })
    };
  } catch (error) {
    logger.error("Error getting audit logs", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to retrieve audit logs" })
    };
  }
};
