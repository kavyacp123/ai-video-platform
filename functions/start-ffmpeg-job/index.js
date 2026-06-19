const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");

const sqs = new SQSClient({});

exports.handler = async (input) => {
  const resolutions = input.plan?.outputResolutions || ["720p", "480p", "360p"];

  // Single comprehensive message – the worker handles ALL artifact types in one FFmpeg pass.
  const message = {
    videoId:           input.videoId,
    userId:            input.userId,
    s3Key:             input.s3Key,
    sourceBucket:      input.rawBucket || process.env.RAW_BUCKET_NAME,
    outputBucket:      process.env.PROCESSED_BUCKET_NAME,
    thumbnailBucket:   process.env.THUMBNAIL_BUCKET_NAME,
    resolutions,
    // Single-pass flags – driven by the AI plan
    generateThumbnail: input.plan?.generateThumbnail !== false,
    generateFrames:    input.plan?.moderationLevel   !== "none",
    generateClip:      input.plan?.generateHighlights !== false,
    clips:             input.clips || [],    // AI-identified clip timestamps
    taskToken:         input.taskToken,
  };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl:                process.env.TRANSCODE_QUEUE_URL,
      MessageGroupId:          `${input.videoId}-transcode`,
      MessageDeduplicationId:  `${input.videoId}-${Date.now()}`,
      MessageBody:             JSON.stringify(message),
    })
  );

  await updateVideoStatus(input.videoId, "TRANSCODING", {
    singlePassMode: true,
    expectedArtifacts: {
      hls:       resolutions,
      thumbnail: message.generateThumbnail,
      frames:    message.generateFrames,
      clip:      message.generateClip,
    },
  });
  await appendProcessingEvent(
    input.videoId,
    "START_FFMPEG_SINGLE_PASS",
    `Single-pass FFmpeg job queued (resolutions: ${resolutions.join(", ")})`
  );

  return { ...input, ffmpegQueued: true, singlePassMode: true };
};
