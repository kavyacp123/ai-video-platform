const { getComments } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || 50), 100);
    const lastKey = event.queryStringParameters?.lastKey ? JSON.parse(event.queryStringParameters.lastKey) : undefined;

    const result = await getComments(videoId, limit, lastKey);

    logger.info("Comments retrieved", { videoId, count: result.items.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        comments: result.items,
        lastKey: result.lastKey
      })
    };
  } catch (error) {
    logger.error("Error getting comments", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to retrieve comments" })
    };
  }
};
