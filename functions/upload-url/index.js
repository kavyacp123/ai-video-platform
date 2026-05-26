const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { json, parseBody, getUserId, errorResponse } = require("../../shared/http");
const { generatePresignedUploadUrl } = require("../../shared/presign");
const { createVideo, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const LIMITS = { free: 5, pro: 100, enterprise: 999999999 };

exports.handler = async (event) => {
  try {
    const userId = getUserId(event);
    const body = parseBody(event);
    const quota = await reserveUploadQuota(userId);
    const videoId = randomUUID();
    const fileName = body.fileName || "video.mp4";
    const contentType = body.contentType || "video/mp4";
    const fileSize = body.fileSize || 0;
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rawS3Key = `uploads/${userId}/${videoId}/${safeFileName}`;
    const uploadUrl = await generatePresignedUploadUrl(process.env.RAW_BUCKET_NAME, rawS3Key, contentType, 900);

    await createVideo({
      videoId,
      userId,
      title: body.title || fileName,
      status: VIDEO_STATUS.UPLOADING,
      category: "uncategorized",
      duration: null,
      fileSize,
      contentType,
      rawS3Key,
      subtitles: {}
    });

    await appendProcessingEvent(videoId, "UPLOAD_URL_CREATED", "Presigned upload URL created.");

    return json(200, {
      videoId,
      uploadUrl,
      rawS3Key,
      quota
    });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException" || error.statusCode === 429) {
      return json(429, error.body || { error: "Upload limit reached" });
    }
    return errorResponse(error);
  }
};

async function reserveUploadQuota(userId) {
  const key = { PK: `USER#${userId}`, SK: "PROFILE" };
  const user = await ddb.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: key }));
  const plan = user.Item?.plan || "free";
  const limit = LIMITS[plan] ?? LIMITS.free;
  const now = Date.now();
  const resetAt = nextUtcMidnightMs();
  const currentResetAt = Number(user.Item?.uploadCountResetAt || 0);
  const currentCount = currentResetAt < now ? 0 : Number(user.Item?.uploadCountToday || 0);

  if (currentCount >= limit) {
    const error = new Error("Upload limit reached");
    error.statusCode = 429;
    error.body = { error: "Upload limit reached", limit, plan };
    throw error;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: key,
      UpdateExpression: "SET uploadCountToday = :next, uploadCountResetAt = :resetAt, updatedAt = :updatedAt",
      ConditionExpression: "attribute_not_exists(uploadCountToday) OR uploadCountToday < :limit OR uploadCountResetAt < :now",
      ExpressionAttributeValues: {
        ":next": currentCount + 1,
        ":resetAt": resetAt,
        ":updatedAt": new Date().toISOString(),
        ":limit": limit,
        ":now": now
      }
    })
  );

  return { used: currentCount + 1, limit, plan };
}

function nextUtcMidnightMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}
