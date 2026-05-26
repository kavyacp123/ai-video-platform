const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");

const sqs = new SQSClient({});

exports.handler = async (input) => {
  const message = {
    videoId: input.videoId,
    userId: input.userId,
    s3Key: input.s3Key,
    sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
    outputBucket: process.env.PROCESSED_BUCKET_NAME,
    resolutions: input.plan?.outputResolutions || ["720p", "480p", "360p"],
    generateHighlights: Boolean(input.plan?.generateHighlights),
    taskToken: input.taskToken
  };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.TRANSCODE_QUEUE_URL,
      MessageGroupId: input.videoId,
      MessageDeduplicationId: `${input.videoId}-${Date.now()}`,
      MessageBody: JSON.stringify(message)
    })
  );

  await updateVideoStatus(input.videoId, "CUSTOM_TRANSCODING", {
    customTranscode: {
      mode: "ECS_FARGATE_FFMPEG",
      expectedRenditions: message.resolutions
    }
  });
  await appendProcessingEvent(input.videoId, "START_FFMPEG_JOB", "FFmpeg worker job queued.");
  return { ...input, ffmpegQueued: true };
};

