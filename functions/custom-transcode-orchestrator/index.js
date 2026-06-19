const { SQSClient, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { createRenditionJobs } = require("../../shared/customTranscoder");

const sqs = new SQSClient({});

exports.handler = async (input) => {
  const resolutions = input.plan?.outputResolutions || ["720p", "480p", "360p"];
  const outputPrefix = `custom-hls/${input.videoId}`;
  const jobs = createRenditionJobs({
    videoId: input.videoId,
    userId: input.userId,
    sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
    sourceKey: input.s3Key,
    outputBucket: process.env.PROCESSED_BUCKET_NAME,
    outputPrefix,
    resolutions
  });

  await sqs.send(
    new SendMessageBatchCommand({
      QueueUrl: process.env.TRANSCODE_QUEUE_URL,
      Entries: jobs.map((job, index) => ({
        Id: `${job.videoId}-${job.resolution}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
        MessageGroupId: `${job.videoId}-${job.resolution}`,
        MessageDeduplicationId: `${job.videoId}-${job.resolution}-${Date.now()}`,
        MessageBody: JSON.stringify(job),
        DelaySeconds: index
      }))
    })
  );

  await updateVideoStatus(input.videoId, "CUSTOM_TRANSCODING", {
    customTranscode: {
      mode: "DISTRIBUTED_FFMPEG",
      outputPrefix,
      expectedRenditions: resolutions,
      completedRenditions: []
    }
  });
  await appendProcessingEvent(input.videoId, "CUSTOM_TRANSCODE_QUEUED", `${jobs.length} FFmpeg jobs queued.`);

  return {
    ...input,
    customTranscode: {
      outputPrefix,
      jobs
    }
  };
};

