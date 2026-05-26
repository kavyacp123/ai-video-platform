const { json, getUserId, errorResponse } = require("../../shared/http");
const { getVideo } = require("../../shared/dynamoService");

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

