const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { parseEventBridge } = require("../../shared/eventParser");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const detail = parseEventBridge(event);
  const api = new ApiGatewayManagementApiClient({ endpoint: process.env.WEBSOCKET_CALLBACK_URL });
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `WS_USER#${detail.userId}` }
    })
  );

  await Promise.all(
    (result.Items || []).map((connection) =>
      api
        .send(
          new PostToConnectionCommand({
            ConnectionId: connection.connectionId,
            Data: Buffer.from(JSON.stringify({ type: event["detail-type"], ...detail }))
          })
        )
        .catch(() => undefined)
    )
  );
};

