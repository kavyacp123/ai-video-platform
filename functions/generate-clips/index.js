const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { appendProcessingEvent, updateVideoStatus } = require("../../shared/dynamoService");

const sqs = new SQSClient({});

exports.handler = async (input) => {
  if (!input.plan.generateHighlights) return { ...input, clipsSkipped: true };

  const clips = [{ title: "Auto highlight 1", startSeconds: 0, endSeconds: 15, s3Key: `clips/${input.videoId}/highlight-1.mp4` }];
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.TRANSCODE_QUEUE_URL,
      MessageGroupId: input.videoId,
      MessageDeduplicationId: `${input.videoId}-clips-${Date.now()}`,
      MessageBody: JSON.stringify({
        jobType: "CLIP_GENERATION",
        videoId: input.videoId,
        userId: input.userId,
        sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
        s3Key: input.s3Key,
        outputBucket: process.env.PROCESSED_BUCKET_NAME,
        taskToken: input.taskToken
      })
    })
  );
  await updateVideoStatus(input.videoId, "PROCESSING", { clips });
  await appendProcessingEvent(input.videoId, "CLIPS_QUEUED", "Clip generation FFmpeg worker job queued.");
  return { ...input, clips };
};
