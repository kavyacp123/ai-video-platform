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
  deleteVideo
};

