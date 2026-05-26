const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({});

async function generatePresignedUploadUrl(bucket, key, contentType, expiresIn = 900) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType
    }),
    { expiresIn }
  );
}

async function generatePresignedDownloadUrl(bucket, key, expiresIn = 900) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

module.exports = {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl
};

