const { json, getUserId, errorResponse } = require("../../shared/http");
const { listUserVideos } = require("../../shared/dynamoService");

exports.handler = async (event) => {
  console.log("Request context:", JSON.stringify(event.requestContext, null, 2));
  try {
    const userId = getUserId(event);
    const limit = Number(event.queryStringParameters?.limit || 20);
    const lastKey = event.queryStringParameters?.lastKey
      ? JSON.parse(Buffer.from(event.queryStringParameters.lastKey, "base64").toString("utf8"))
      : undefined;

    const result = await listUserVideos(userId, limit, lastKey);
    return json(200, {
      items: result.items,
      nextToken: result.lastKey ? Buffer.from(JSON.stringify(result.lastKey)).toString("base64") : null
    });
  } catch (error) {
    return errorResponse(error);
  }
};

