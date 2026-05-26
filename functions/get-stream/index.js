const { json, getUserId, errorResponse } = require("../../shared/http");
const { getVideo } = require("../../shared/dynamoService");
const { createSignedUrl } = require("../../shared/cloudfrontSigner");

exports.handler = async (event) => {
  try {
    const userId = getUserId(event);
    const videoId = event.pathParameters?.id || event.pathParameters?.videoId;
    const video = await getVideo(videoId);

    if (!video) return json(404, { message: "Video not found" });
    if (video.userId !== userId) return json(403, { message: "Forbidden" });
    if (video.status !== "READY") return json(409, { message: "Video is not ready", status: video.status });

    const playbackUrl = process.env.CF_KEY_PAIR_ID || process.env.CLOUDFRONT_KEY_PAIR_ID
      ? await createSignedUrl(video.hlsS3Key || `hls/${videoId}/master.m3u8`)
      : `https://${process.env.CLOUDFRONT_DOMAIN}/${video.hlsS3Key || `hls/${videoId}/master.m3u8`}`;

    return json(200, {
      playbackUrl,
      subtitles: video.subtitles || {},
      thumbnail: video.thumbnailUrl,
      duration: video.duration
    });
  } catch (error) {
    return errorResponse(error);
  }
};
