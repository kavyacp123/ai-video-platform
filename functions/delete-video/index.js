const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");
const { json, getUserId, errorResponse } = require("../../shared/http");
const { getVideo } = require("../../shared/dynamoService");

const sfn = new SFNClient({});

exports.handler = async (event) => {
  try {
    const userId = getUserId(event);
    const videoId = event.pathParameters?.id || event.pathParameters?.videoId;
    const video = await getVideo(videoId);

    if (!video) return json(404, { message: "Video not found" });
    if (video.userId !== userId) return json(403, { message: "Forbidden" });

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: process.env.DELETION_STATE_MACHINE_ARN,
        name: `delete-${videoId}-${Date.now()}`,
        input: JSON.stringify({ videoId, userId, video })
      })
    );

    return json(202, { videoId, accepted: true, status: "DELETING" });
  } catch (error) {
    return errorResponse(error);
  }
};
