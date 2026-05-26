const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME || process.env.VIDEOS_TABLE_NAME;
const KEY = { PK: "CIRCUIT_BREAKER#bedrock", SK: "STATE" };
const OPEN_WINDOW_MS = 60000;
const FAILURE_THRESHOLD = 5;

async function getState() {
  const result = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: KEY }));
  if (result.Item) {
    return result.Item;
  }

  const item = {
    ...KEY,
    failureCount: 0,
    lastFailureTime: 0,
    state: "CLOSED",
    updatedAt: Date.now()
  };

  await ddb
    .send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)"
      })
    )
    .catch((error) => {
      if (error.name !== "ConditionalCheckFailedException") throw error;
    });

  return item;
}

async function beforeCall() {
  const state = await getState();
  const now = Date.now();

  if (state.state === "OPEN" && now - Number(state.lastFailureTime || 0) < OPEN_WINDOW_MS) {
    return { allowed: false, state };
  }

  if (state.state === "OPEN") {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: KEY,
        UpdateExpression: "SET #state = :halfOpen, updatedAt = :now",
        ConditionExpression: "#state = :open",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: {
          ":halfOpen": "HALF_OPEN",
          ":open": "OPEN",
          ":now": now
        }
      })
    );
    return { allowed: true, state: { ...state, state: "HALF_OPEN" } };
  }

  return { allowed: true, state };
}

async function recordSuccess() {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: KEY,
      UpdateExpression: "SET failureCount = :zero, lastFailureTime = :zero, #state = :closed, updatedAt = :now",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":zero": 0,
        ":closed": "CLOSED",
        ":now": Date.now()
      }
    })
  );
}

async function recordFailure() {
  const now = Date.now();
  const state = await getState();
  const failureCount = Number(state.failureCount || 0) + 1;
  const nextState = failureCount >= FAILURE_THRESHOLD || state.state === "HALF_OPEN" ? "OPEN" : "CLOSED";

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: KEY,
      UpdateExpression:
        "SET failureCount = :failureCount, lastFailureTime = :now, #state = :state, updatedAt = :now",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":failureCount": failureCount,
        ":now": now,
        ":state": nextState
      }
    })
  );

  return { failureCount, state: nextState };
}

module.exports = {
  beforeCall,
  recordSuccess,
  recordFailure
};

