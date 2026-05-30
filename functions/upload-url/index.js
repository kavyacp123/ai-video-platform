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
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
const MAX_FILENAME_LENGTH = 255;
const MAX_TITLE_LENGTH = 200;
const VALID_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];

/**
 * Generates a presigned S3 upload URL for authenticated users
 * Enforces per-user quotas based on subscription tier
 *
 * @param {Object} event - API Gateway HTTP request
 * @param {Object} event.headers - HTTP headers with Authorization
 * @param {string} event.body - JSON body with {fileName, contentType, fileSize, title}
 *
 * @returns {Promise<Object>} {videoId, uploadUrl, rawS3Key, quota}
 * @throws {Error} If user exceeds quota (429) or validation fails
 *
 * Quota limits:
 * - free: 5 uploads/day
 * - pro: 100 uploads/day
 * - enterprise: unlimited
 *
 * Resets at UTC midnight
 */
exports.handler = async (event) => {
  try {
    const userId = getUserId(event);
    const body = parseBody(event);

    // Validate input
    const validation = validateUploadInput(body);
    if (!validation.valid) {
      return json(400, { error: validation.errors[0], details: validation.errors });
    }

    const quota = await reserveUploadQuota(userId);
    const videoId = randomUUID();
    const fileName = validation.sanitized.fileName;
    const contentType = validation.sanitized.contentType;
    const fileSize = validation.sanitized.fileSize;

    const rawS3Key = `uploads/${userId}/${videoId}/${fileName}`;
    const uploadUrl = await generatePresignedUploadUrl(process.env.RAW_BUCKET_NAME, rawS3Key, contentType, 900);

    await createVideo({
      videoId,
      userId,
      title: validation.sanitized.title,
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

/**
 * Validates upload request body for security and business rules
 *
 * @param {Object} body - Request body
 * @returns {Object} {valid: boolean, errors: string[], sanitized: {...}}
 */
function validateUploadInput(body) {
  const errors = [];

  // Validate fileName
  if (!body.fileName || body.fileName.trim().length === 0) {
    errors.push("fileName is required");
  }
  if (body.fileName && body.fileName.length > MAX_FILENAME_LENGTH) {
    errors.push(`fileName cannot exceed ${MAX_FILENAME_LENGTH} characters`);
  }

  // Validate contentType
  const contentType = body.contentType || "video/mp4";
  if (!VALID_CONTENT_TYPES.includes(contentType)) {
    errors.push(`Invalid contentType. Allowed: ${VALID_CONTENT_TYPES.join(", ")}`);
  }

  // Validate fileSize
  if (body.fileSize > MAX_FILE_SIZE) {
    errors.push(`fileSize exceeds maximum of ${MAX_FILE_SIZE} bytes (50GB)`);
  }
  if (body.fileSize < 0) {
    errors.push("fileSize cannot be negative");
  }

  // Validate title
  const title = body.title || body.fileName || "Untitled";
  if (title.length > MAX_TITLE_LENGTH) {
    errors.push(`title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      fileName: sanitizeFileName(body.fileName),
      title: title.substring(0, MAX_TITLE_LENGTH),
      contentType,
      fileSize: Math.max(0, body.fileSize || 0)
    }
  };
}

/**
 * Sanitizes fileName to prevent directory traversal and invalid characters
 * Replaces non-alphanumeric chars (except . - _) with underscore
 */
function sanitizeFileName(fileName) {
  if (!fileName) return "video.mp4";
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, MAX_FILENAME_LENGTH);
}

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

  return {
    used: currentCount + 1,
    limit,
    plan,
    resetsAt: new Date(resetAt).toISOString()
  };
}

function nextUtcMidnightMs() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}
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
