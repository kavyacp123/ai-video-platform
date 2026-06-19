const { getVideoAnalytics } = require("../../shared/dynamoService.js");
const logger = require("../../shared/logger.js");

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;

    const analytics = await getVideoAnalytics(videoId);

    logger.info("Video analytics retrieved", { videoId });

    return {
      statusCode: 200,
      body: JSON.stringify(analytics)
    };
  } catch (error) {
    logger.error("Error getting video analytics", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to retrieve analytics" })
    };
  }
};
