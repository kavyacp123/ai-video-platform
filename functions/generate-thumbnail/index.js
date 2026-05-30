const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");

const sqs = new SQSClient({});

exports.handler = async (input) => {
  if (!input.plan.generateThumbnail) return { ...input, thumbnailSkipped: true };

  const thumbnailUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/thumbnails/${input.videoId}/poster.jpg`;
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.TRANSCODE_QUEUE_URL,
      MessageGroupId: input.videoId,
      MessageDeduplicationId: `${input.videoId}-thumbnail-${Date.now()}`,
      MessageBody: JSON.stringify({
        jobType: "THUMBNAIL",
        videoId: input.videoId,
        userId: input.userId,
        sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
        s3Key: input.s3Key,
        outputBucket: process.env.THUMBNAIL_BUCKET_NAME,
        taskToken: input.taskToken
      })
    })
  );
  await updateVideoStatus(input.videoId, "PROCESSING", { thumbnailUrl });
  await appendProcessingEvent(input.videoId, "THUMBNAIL_QUEUED", "Thumbnail FFmpeg worker job queued.");
  return { ...input, thumbnailUrl };
};
