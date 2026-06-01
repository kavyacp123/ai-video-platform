const { QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { client } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");

const TABLE_NAME = process.env.TABLE_NAME;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

exports.handler = async (event) => {
  try {
    const { videoId, userId } = event.pathParameters;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || 10), 50);

    // Get videos similar to this one based on user engagement patterns
    const recommendations = await getRecommendations(videoId, userId, limit);

    logger.info("Recommendations retrieved", { videoId, userId, count: recommendations.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        videoId,
        recommendations: recommendations.map((r) => ({
          videoId: r.videoId,
          title: r.title,
          similarity: r.similarity,
          reason: r.reason
        }))
      })
    };
  } catch (error) {
    logger.error("Error getting recommendations", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to get recommendations" })
    };
  }
};

async function getRecommendations(videoId, userId, limit) {
  // Simple collaborative filtering: find videos watched by users who watched this video
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": `ENGAGEMENT#${videoId}` },
      Limit: 100
    })
  );

  const viewerUserIds = new Set((result.Items || []).map((item) => item.userId).filter((id) => id !== userId));

  if (viewerUserIds.size === 0) {
    return [];
  }

  // Get videos watched by similar users
  const videoScores = new Map();

  for (const viewerId of Array.from(viewerUserIds).slice(0, 20)) {
    const viewerWatches = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: { ":pk": `USER#${viewerId}`, ":sk": "WATCH#" },
        Limit: 50
      })
    );

    (viewerWatches.Items || []).forEach((watch) => {
      if (watch.videoId !== videoId) {
        videoScores.set(watch.videoId, (videoScores.get(watch.videoId) || 0) + 1);
      }
    });
  }

  // Sort by score and get top recommendations
  const sorted = Array.from(videoScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([recVideoId, score]) => ({
      videoId: recVideoId,
      title: `Recommended Video ${recVideoId.substring(0, 8)}`,
      similarity: Math.round((score / viewerUserIds.size) * 100),
      reason: "Users who watched this video also watched this"
    }));

  return sorted;
}
