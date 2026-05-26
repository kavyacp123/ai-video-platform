const { MediaConvertClient, GetJobCommand } = require("@aws-sdk/client-mediaconvert");
const { appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES } = require("../../shared/constants");

const mediaConvert = new MediaConvertClient({ endpoint: process.env.MEDIACONVERT_ENDPOINT });

exports.handler = async (input) => {
  const result = await mediaConvert.send(new GetJobCommand({ Id: input.mediaConvertJobId }));
  const status = result.Job?.Status;

  if (status === "COMPLETE") {
    const hlsS3Key = `hls/${input.videoId}/master.m3u8`;
    await appendProcessingEvent(input.videoId, EVENT_TYPES.HLS_GENERATED, "HLS output generated.");
    await publish(EVENT_TYPES.HLS_GENERATED, {
      videoId: input.videoId,
      userId: input.userId,
      hlsS3Key,
      resolutions: input.plan.outputResolutions || []
    });
    return { ...input, transcodeStatus: "COMPLETE", hlsS3Key };
  }

  if (status === "ERROR" || status === "CANCELED") {
    throw new Error(`MediaConvert job ${input.mediaConvertJobId} ended with ${status}`);
  }

  return { ...input, transcodeStatus: "PROGRESSING" };
};

