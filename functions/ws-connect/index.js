const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const userId = event.queryStringParameters?.userId || "anonymous";
  await ddb.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        PK: `WS#${connectionId}`,
        SK: "CONNECTION",
        GSI1PK: `WS_USER#${userId}`,
        GSI1SK: new Date().toISOString(),
        connectionId,
        userId,
        ttl: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
        connectedAt: new Date().toISOString()
      }
    })
  );
  return { statusCode: 200 };
};

