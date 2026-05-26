const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } = require("@aws-sdk/client-sfn");
const { appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES } = require("../../shared/constants");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

exports.handler = async (event) => {
  const detail = event.detail || {};
  const jobId = detail.jobId;
  if (!jobId) return;

  const result = await ddb.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `MEDIACONVERT#${jobId}`, SK: "TASK_TOKEN" }
    })
  );

  if (!result.Item?.taskToken) {
    console.warn("No task token found for MediaConvert job", jobId);
    return;
  }

  if (detail.status === "COMPLETE") {
    const output = {
      videoId: result.Item.videoId,
      userId: result.Item.userId,
      mediaConvertJobId: jobId,
      hlsS3Key: `hls/${result.Item.videoId}/master.m3u8`,
      transcodeStatus: "COMPLETE"
    };
    await appendProcessingEvent(result.Item.videoId, EVENT_TYPES.HLS_GENERATED, "MediaConvert completed.");
    await publish(EVENT_TYPES.HLS_GENERATED, {
      videoId: result.Item.videoId,
      userId: result.Item.userId,
      hlsS3Key: output.hlsS3Key,
      resolutions: []
    });
    await sfn.send(new SendTaskSuccessCommand({ taskToken: result.Item.taskToken, output: JSON.stringify(output) }));
  } else if (["ERROR", "CANCELED"].includes(detail.status)) {
    await sfn.send(
      new SendTaskFailureCommand({
        taskToken: result.Item.taskToken,
        error: detail.status,
        cause: JSON.stringify(detail)
      })
    );
  }

  await ddb.send(
    new DeleteCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `MEDIACONVERT#${jobId}`, SK: "TASK_TOKEN" }
    })
  );
};

