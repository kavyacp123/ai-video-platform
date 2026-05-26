const { appendProcessingEvent } = require("../../shared/dynamoService");

exports.handler = async (input) => {
  if (input.plan.moderationLevel === "none") return { ...input, moderationSkipped: true };

  const frameS3Keys = [
    `${input.videoId}/frames/frame-0.jpg`,
    `${input.videoId}/frames/frame-1.jpg`,
    `${input.videoId}/frames/frame-2.jpg`
  ];

  await appendProcessingEvent(
    input.videoId,
    "EXTRACT_FRAMES",
    "Frame extraction skeleton completed. Attach ffmpeg Lambda layer for real extraction."
  );
  return { ...input, frameS3Keys };
};

