const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*"
  },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const fileName = body.fileName || "video.mp4";
  const contentType = body.contentType || "video/mp4";
  const videoId = randomUUID();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rawKey = `uploads/${videoId}/${safeFileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.RAW_BUCKET_NAME,
    Key: rawKey,
    ContentType: contentType,
    Metadata: {
      videoId
    }
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: process.env.VIDEOS_TABLE_NAME,
      Item: {
        videoId,
        status: "UPLOAD_URL_CREATED",
        fileName,
        contentType,
        rawKey,
        createdAt: now,
        updatedAt: now
      }
    })
  );

  return json(200, {
    videoId,
    uploadUrl,
    rawKey
  });
};

