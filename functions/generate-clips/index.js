const { appendProcessingEvent, updateVideoStatus } = require("../../shared/dynamoService");

exports.handler = async (input) => {
  if (!input.plan.generateHighlights) return { ...input, clipsSkipped: true };

  const clips = [
    { title: "Auto highlight 1", startSeconds: 0, endSeconds: 15, s3Key: `clips/${input.videoId}/highlight-1.mp4` }
  ];
  await updateVideoStatus(input.videoId, "PROCESSING", { clips });
  await appendProcessingEvent(input.videoId, "CLIPS_GENERATED", "Clip generation skeleton completed.");
  return { ...input, clips };
};

