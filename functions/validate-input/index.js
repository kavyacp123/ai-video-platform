const { getVideo, appendProcessingEvent } = require("../../shared/dynamoService");
const { validateProcessingPlan } = require("../../shared/processingPlan");

exports.handler = async (input) => {
  const video = await getVideo(input.videoId);
  if (!video) throw new Error(`Video ${input.videoId} not found`);
  const plan = validateProcessingPlan(input.plan);
  await appendProcessingEvent(input.videoId, "VALIDATE_INPUT", "Pipeline input validated.");
  return { ...input, plan, video };
};

