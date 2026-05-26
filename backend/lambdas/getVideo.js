const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

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
  const videoId = event.pathParameters?.videoId;

  if (!videoId) {
    return json(400, { message: "videoId is required" });
  }

  const result = await ddb.send(
    new GetCommand({
      TableName: process.env.VIDEOS_TABLE_NAME,
      Key: { videoId }
    })
  );

  if (!result.Item) {
    return json(404, { message: "Video not found" });
  }

  return json(200, result.Item);
};

