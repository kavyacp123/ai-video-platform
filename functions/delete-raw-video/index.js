const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { appendProcessingEvent } = require("../../shared/dynamoService");

const s3 = new S3Client({});

exports.handler = async (input) => {
  const key = input.video?.rawS3Key;
  if (key) {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.RAW_BUCKET_NAME, Key: key }));
  }
  await appendProcessingEvent(input.videoId, "DELETE_RAW_VIDEO", key ? "Raw video deleted." : "No raw video key found.");
  return input;
};

