const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (input) => {
  const pk = `VIDEO#${input.videoId}`;
  let token;
  const keys = [];

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: token
      })
    );
    keys.push(...(result.Items || []).map((item) => ({ PK: item.PK, SK: item.SK })));
    token = result.LastEvaluatedKey;
  } while (token);

  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [process.env.TABLE_NAME]: batch.map((Key) => ({ DeleteRequest: { Key } }))
        }
      })
    );
  }

  return { ...input, deletedRecords: keys.length };
};

