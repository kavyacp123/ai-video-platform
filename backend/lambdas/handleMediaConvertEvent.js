const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const detail = event.detail || {};
  const videoId = detail.userMetadata?.videoId;

  if (!videoId) {
    console.warn("MediaConvert event did not include userMetadata.videoId", JSON.stringify(event));
    return;
  }

  const status = detail.status === "COMPLETE" ? "READY" : "FAILED";

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.VIDEOS_TABLE_NAME,
      Key: { videoId },
      UpdateExpression:
        "SET #status = :status, mediaConvertStatus = :mediaConvertStatus, mediaConvertJobId = :jobId, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":mediaConvertStatus": detail.status,
        ":jobId": detail.jobId,
        ":updatedAt": new Date().toISOString()
      }
    })
  );
};

