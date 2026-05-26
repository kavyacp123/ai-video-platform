const { getVideo, updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");

exports.handler = async (input) => {
  const video = input.video || (await getVideo(input.videoId));
  if (!video) throw new Error(`Video ${input.videoId} not found`);

  await updateVideoStatus(input.videoId, "DELETING");
  await appendProcessingEvent(input.videoId, "VIDEO_DELETE_STARTED", "Video deletion workflow started.");

  return { ...input, video };
};

