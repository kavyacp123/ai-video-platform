const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { appendProcessingEvent } = require("../../shared/dynamoService");

const sqs = new SQSClient({});

exports.handler = async (input) => {
  if (input.plan.moderationLevel === "none") return { ...input, moderationSkipped: true };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.TRANSCODE_QUEUE_URL,
      MessageGroupId: input.videoId,
      MessageDeduplicationId: `${input.videoId}-frames-${Date.now()}`,
      MessageBody: JSON.stringify({
        jobType: "FRAME_EXTRACTION",
        videoId: input.videoId,
        userId: input.userId,
        sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
        s3Key: input.s3Key,
        outputBucket: process.env.THUMBNAIL_BUCKET_NAME,
        moderationLevel: input.plan.moderationLevel,
        taskToken: input.taskToken
      })
    })
  );

  await appendProcessingEvent(input.videoId, "EXTRACT_FRAMES_QUEUED", "Frame extraction FFmpeg worker job queued.");
  return input;
};
