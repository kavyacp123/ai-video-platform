const { json, getUserId, errorResponse } = require("../../shared/http");
const { getVideo } = require("../../shared/dynamoService");

/**
 * Get video metadata by ID
 *
 * Retrieves full video record from DynamoDB.
 * Enforces ownership: users can only see their own videos.
 *
 * @param {Object} event - API Gateway HTTP event
 * @param {string} event.pathParameters.id - Video ID (UUID format)
 * @param {Object} event.headers - HTTP headers with Authorization
 *
 * @returns {Object} Video metadata object
 * - videoId, userId, title, status, duration, fileSize, thumbnail, etc
 *
 * Status codes:
 * - 200: Video found and returned
 * - 403: Forbidden (not video owner)
 * - 404: Video not found
 * - 500: DynamoDB error
 *
 * @throws Rejects if video owned by different user
 */
exports.handler = async (event) => {
  try {
    const userId = getUserId(event);
    const videoId = event.pathParameters?.id || event.pathParameters?.videoId;
    const video = await getVideo(videoId);

    if (!video) return json(404, { message: "Video not found" });
    if (video.userId !== userId) return json(403, { message: "Forbidden" });

    return json(200, video);
  } catch (error) {
    return errorResponse(error);
  }
};

