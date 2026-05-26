const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  await ddb.send(
    new DeleteCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `WS#${event.requestContext.connectionId}`, SK: "CONNECTION" }
    })
  );
  return { statusCode: 200 };
};

