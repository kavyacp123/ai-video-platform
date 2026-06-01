const { QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { client } = require("../../shared/dynamoService.js");
const { logger } = require("../../shared/logger.js");

const TABLE_NAME = process.env.TABLE_NAME;

exports.handler = async (event) => {
  try {
    const { videoId } = event.pathParameters;
    const resolution = event.queryStringParameters?.resolution || "full";

    const heatmap = await generateHeatmap(videoId, resolution);

    logger.info("Heatmap generated", { videoId, resolution });

    return {
      statusCode: 200,
      body: JSON.stringify({
        videoId,
        heatmap: heatmap.heatmapData,
        stats: heatmap.stats
      })
    };
  } catch (error) {
    logger.error("Error generating heatmap", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate heatmap" })
    };
  }
};

async function generateHeatmap(videoId, resolution) {
  // Get all engagement events for this video
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `ENGAGEMENT#${videoId}` }
    })
  );

  const events = result.Items || [];

  // Create bucketed heatmap (10-second buckets)
  const bucketSize = 10;
  const heatmapBuckets = new Map();
  const eventCounts = { play: 0, pause: 0, skip: 0, replay: 0, seek: 0 };

  events.forEach((event) => {
    const bucket = Math.floor(event.position / bucketSize);
    const key = bucket * bucketSize;

    if (!heatmapBuckets.has(key)) {
      heatmapBuckets.set(key, { plays: 0, pauses: 0, skips: 0, replays: 0 });
    }

    const bucketData = heatmapBuckets.get(key);
    switch (event.eventType) {
      case "play":
        bucketData.plays++;
        eventCounts.play++;
        break;
      case "pause":
        bucketData.pauses++;
        eventCounts.pause++;
        break;
      case "skip":
        bucketData.skips++;
        eventCounts.skip++;
        break;
      case "replay":
        bucketData.replays++;
        eventCounts.replay++;
        break;
    }
  });

  // Calculate retention (drop-off at each point)
  const retention = calculateRetention(Array.from(heatmapBuckets.entries()));

  // Save heatmap
  if (heatmapBuckets.size > 0) {
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `HEATMAP#${videoId}`,
          SK: `${resolution}#${new Date().toISOString()}`,
          entityType: "HEATMAP",
          videoId,
          resolution,
          buckets: Object.fromEntries(heatmapBuckets),
          retention,
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year
        }
      })
    );
  }

  return {
    heatmapData: Object.fromEntries(heatmapBuckets),
    stats: {
      totalEvents: events.length,
      eventBreakdown: eventCounts,
      retention,
      avgEngagement: (eventCounts.play / (events.length || 1)).toFixed(2)
    }
  };
}

function calculateRetention(buckets) {
  if (buckets.length === 0) return {};

  const retention = {};
  const maxPlays = Math.max(...buckets.map(([_, b]) => b.plays || 1));

  buckets.forEach(([position, data]) => {
    const percentage = Math.round((data.plays / maxPlays) * 100);
    retention[position] = percentage;
  });

  return retention;
}
