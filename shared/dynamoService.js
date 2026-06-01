const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand
} = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE_NAME = process.env.TABLE_NAME || process.env.VIDEOS_TABLE_NAME;

function nowIso() {
  return new Date().toISOString();
}

function ttlFromNow(seconds) {
  return Math.floor(Date.now() / 1000) + seconds;
}

async function createUserProfile({ userId, email, name, plan = "free" }) {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: "PROFILE",
        entityType: "USER",
        userId,
        email,
        name,
        plan,
        uploadCount: 0,
        createdAt,
        updatedAt: createdAt
      },
      ConditionExpression: "attribute_not_exists(PK)"
    })
  );
}

async function getUserProfile(userId) {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" }
    })
  );
  return result.Item;
}

async function createVideo(video) {
  const createdAt = video.createdAt || nowIso();
  const item = {
    PK: `VIDEO#${video.videoId}`,
    SK: "METADATA",
    GSI1PK: `USER#${video.userId}`,
    GSI1SK: createdAt,
    GSI2PK: `STATUS#${video.status}`,
    GSI2SK: createdAt,
    entityType: "VIDEO",
    ...video,
    createdAt,
    updatedAt: createdAt
  };

  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK)"
    })
  );

  return item;
}

async function getVideo(videoId) {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `VIDEO#${videoId}`, SK: "METADATA" }
    })
  );
  return result.Item;
}

async function updateVideoStatus(videoId, status, extra = {}) {
  const names = { "#status": "status" };
  const values = {
    ":status": status,
    ":gsi2pk": `STATUS#${status}`,
    ":updatedAt": nowIso()
  };
  const sets = ["#status = :status", "GSI2PK = :gsi2pk", "updatedAt = :updatedAt"];

  Object.entries(extra).forEach(([key, value], index) => {
    names[`#extra${index}`] = key;
    values[`:extra${index}`] = value;
    sets.push(`#extra${index} = :extra${index}`);
  });

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `VIDEO#${videoId}`, SK: "METADATA" },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );
}

async function listUserVideos(userId, limit = 20, lastKey) {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `USER#${userId}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey
    })
  );

  return {
    items: result.Items || [],
    lastKey: result.LastEvaluatedKey
  };
}

async function markIdempotency(eventId) {
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `IDEMPOTENCY#${eventId}`,
        SK: "LOCK",
        entityType: "IDEMPOTENCY",
        eventId,
        status: "LOCKED",
        ttl: ttlFromNow(24 * 60 * 60),
        createdAt: nowIso()
      },
      ConditionExpression: "attribute_not_exists(PK)"
    })
  );
  return true;
}

async function checkIdempotency(eventId) {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `IDEMPOTENCY#${eventId}`, SK: "LOCK" }
    })
  );
  return Boolean(result.Item);
}

async function appendProcessingEvent(videoId, eventType, message, status = "success") {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `VIDEO#${videoId}`,
        SK: `EVENT#${createdAt}#${eventType}`,
        entityType: "PROCESSING_EVENT",
        eventType,
        status,
        message,
        ttl: ttlFromNow(30 * 24 * 60 * 60),
        createdAt
      }
    })
  );
}

async function deleteVideo(videoId) {
  await client.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `VIDEO#${videoId}`, SK: "METADATA" }
    })
  );
}

// ============= SOCIAL FEATURES =============

async function createComment({ videoId, userId, commentId, text, userName }) {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `COMMENT#${videoId}`,
        SK: `${createdAt}#${commentId}`,
        GSI1PK: `COMMENT#${videoId}`,
        GSI1SK: createdAt,
        entityType: "COMMENT",
        videoId,
        commentId,
        userId,
        userName,
        text,
        likes: 0,
        status: "active",
        createdAt,
        updatedAt: createdAt
      }
    })
  );
}

async function getComments(videoId, limit = 50, lastKey) {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `COMMENT#${videoId}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey
    })
  );
  return {
    items: result.Items || [],
    lastKey: result.LastEvaluatedKey
  };
}

async function likeVideo({ videoId, userId }) {
  const likeId = `${videoId}#${userId}`;
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `LIKE#${videoId}`,
        SK: userId,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `LIKE#${createdAt}`,
        entityType: "LIKE",
        videoId,
        userId,
        createdAt,
        ttl: ttlFromNow(5 * 365 * 24 * 60 * 60)
      },
      ConditionExpression: "attribute_not_exists(PK)"
    })
  );
}

async function unlikeVideo({ videoId, userId }) {
  await client.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `LIKE#${videoId}`, SK: userId }
    })
  );
}

async function rateVideo({ videoId, userId, rating }) {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `RATING#${videoId}`,
        SK: userId,
        GSI1PK: `VIDEO#${videoId}`,
        GSI1SK: `RATING#${rating}`,
        entityType: "RATING",
        videoId,
        userId,
        rating,
        createdAt,
        updatedAt: createdAt
      }
    })
  );
}

async function followUser({ userId, targetUserId }) {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `FOLLOW#${userId}`,
        SK: targetUserId,
        GSI1PK: `FOLLOWERS#${targetUserId}`,
        GSI1SK: createdAt,
        entityType: "FOLLOW",
        userId,
        targetUserId,
        createdAt,
        ttl: ttlFromNow(5 * 365 * 24 * 60 * 60)
      },
      ConditionExpression: "attribute_not_exists(PK)"
    })
  );
}

async function unfollowUser({ userId, targetUserId }) {
  await client.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `FOLLOW#${userId}`, SK: targetUserId }
    })
  );
}

// ============= ADMIN & COMPLIANCE =============

async function createAuditLog({ userId, action, resource, resourceId, status, details }) {
  const logId = `${Date.now()}#${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `AUDIT#${createdAt.split("T")[0]}`,
        SK: `${createdAt}#${logId}`,
        GSI1PK: `AUDIT#${userId}`,
        GSI1SK: createdAt,
        GSI2PK: `AUDIT#${action}`,
        GSI2SK: createdAt,
        entityType: "AUDIT_LOG",
        logId,
        userId,
        action,
        resource,
        resourceId,
        status,
        details,
        createdAt,
        ttl: ttlFromNow(365 * 24 * 60 * 60)
      }
    })
  );
}

async function getAuditLogs(userId, limit = 50, lastKey) {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `AUDIT#${userId}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey
    })
  );
  return {
    items: result.Items || [],
    lastKey: result.LastEvaluatedKey
  };
}

async function createViolationReport({ videoId, userId, reporterUserId, reason, description }) {
  const reportId = `VIO#${Date.now()}#${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `VIOLATION#${videoId}`,
        SK: `${createdAt}#${reportId}`,
        GSI1PK: `VIOLATIONS#PENDING`,
        GSI1SK: createdAt,
        entityType: "VIOLATION_REPORT",
        reportId,
        videoId,
        userId,
        reporterUserId,
        reason,
        description,
        status: "pending",
        createdAt,
        updatedAt: createdAt,
        ttl: ttlFromNow(180 * 24 * 60 * 60)
      }
    })
  );
  return reportId;
}

async function setUserPermission({ userId, role, permissions }) {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `PERMISSION#${userId}`,
        SK: "ROLE",
        entityType: "PERMISSION",
        userId,
        role,
        permissions,
        createdAt,
        updatedAt: createdAt
      }
    })
  );
}

async function getUserPermission(userId) {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PERMISSION#${userId}`, SK: "ROLE" }
    })
  );
  return result.Item || { role: "user", permissions: ["read_own_videos", "upload_videos", "comment"] };
}

// ============= ANALYTICS =============

async function trackWatchSession({ videoId, userId, sessionId, startTime, position, duration }) {
  const createdAt = nowIso();
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `WATCH#${videoId}`,
        SK: `${createdAt}#${sessionId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `WATCH#${createdAt}`,
        GSI2PK: `ENGAGEMENT#${videoId}`,
        GSI2SK: createdAt,
        entityType: "WATCH_SESSION",
        videoId,
        userId,
        sessionId,
        startTime,
        position,
        duration,
        createdAt,
        ttl: ttlFromNow(365 * 24 * 60 * 60)
      }
    })
  );
}

async function trackEngagementEvent({ videoId, userId, eventType, position, metadata }) {
  const createdAt = nowIso();
  const eventId = `${Date.now()}#${Math.random().toString(36).substr(2, 9)}`;
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ENGAGEMENT#${videoId}`,
        SK: `${createdAt}#${eventId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `ENGAGEMENT#${createdAt}`,
        entityType: "ENGAGEMENT_EVENT",
        videoId,
        userId,
        eventType,
        position,
        metadata,
        createdAt,
        ttl: ttlFromNow(365 * 24 * 60 * 60)
      }
    })
  );
}

async function getVideoAnalytics(videoId) {
  // Get watch sessions
  const watches = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `WATCH#${videoId}` },
      ScanIndexForward: false
    })
  );

  // Get engagements
  const engagements = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `ENGAGEMENT#${videoId}` },
      ScanIndexForward: false
    })
  );

  // Get likes and ratings
  const likes = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `LIKE#${videoId}` }
    })
  );

  const ratings = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `RATING#${videoId}` }
    })
  );

  const ratingValues = (ratings.Items || []).map(r => r.rating);
  const avgRating = ratingValues.length > 0 ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1) : 0;

  return {
    videoId,
    totalWatches: watches.Items?.length || 0,
    totalEngagementEvents: engagements.Items?.length || 0,
    totalLikes: likes.Items?.length || 0,
    totalRatings: ratings.Items?.length || 0,
    averageRating: avgRating,
    engagementBreakdown: {
      plays: (engagements.Items || []).filter(e => e.eventType === "play").length,
      pauses: (engagements.Items || []).filter(e => e.eventType === "pause").length,
      skips: (engagements.Items || []).filter(e => e.eventType === "skip").length,
      replays: (engagements.Items || []).filter(e => e.eventType === "replay").length
    }
  };
}

async function getUserAnalytics(userId) {
  const watches = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "WATCH#" }
    })
  );

  return {
    userId,
    totalWatchSessions: watches.Items?.length || 0,
    watchedVideos: [...new Set((watches.Items || []).map(w => w.videoId))].length
  };
}

module.exports = {
  client,
  createUserProfile,
  getUserProfile,
  createVideo,
  getVideo,
  updateVideoStatus,
  listUserVideos,
  checkIdempotency,
  markIdempotency,
  appendProcessingEvent,
  deleteVideo,
  // Social
  createComment,
  getComments,
  likeVideo,
  unlikeVideo,
  rateVideo,
  followUser,
  unfollowUser,
  // Admin & Compliance
  createAuditLog,
  getAuditLogs,
  createViolationReport,
  setUserPermission,
  getUserPermission,
  // Analytics
  trackWatchSession,
  trackEngagementEvent,
  getVideoAnalytics,
  getUserAnalytics
};

