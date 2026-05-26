const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const eventBridge = new EventBridgeClient({});

const getVideoIdFromKey = (key) => {
  const parts = key.split("/");
  return parts.length >= 2 ? parts[1] : undefined;
};

exports.handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const videoId = getVideoIdFromKey(key);
    const size = record.s3.object.size || 0;

    if (!videoId) {
      console.warn("Could not derive videoId from key", key);
      continue;
    }

    const plan = createProcessingPlan({ key, size });
    const now = new Date().toISOString();

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.VIDEOS_TABLE_NAME,
        Key: { videoId },
        UpdateExpression:
          "SET #status = :status, rawBucket = :rawBucket, rawKey = :rawKey, processingPlan = :plan, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":status": "AI_PLAN_CREATED",
          ":rawBucket": bucket,
          ":rawKey": key,
          ":plan": plan,
          ":updatedAt": now
        }
      })
    );

    await eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: "ai-video-platform",
            DetailType: "AI_PLAN_CREATED",
            Detail: JSON.stringify({
              eventVersion: "v1",
              videoId,
              bucket,
              key,
              plan,
              createdAt: now
            })
          }
        ]
      })
    );
  }
};

function createProcessingPlan({ key, size }) {
  const lowerKey = key.toLowerCase();
  const isShortForm = size > 0 && size < 150 * 1024 * 1024;
  const looksLikePodcast = lowerKey.includes("podcast") || lowerKey.includes("interview");
  const looksLikeCourse = lowerKey.includes("lecture") || lowerKey.includes("course") || lowerKey.includes("tutorial");

  return {
    generateHls: true,
    generateSubtitles: looksLikePodcast || looksLikeCourse,
    generateThumbnail: true,
    generateHighlights: isShortForm,
    moderationLevel: looksLikeCourse ? "standard" : "strict",
    languages: looksLikePodcast || looksLikeCourse ? ["en"] : [],
    renditions: [
      { name: "720p", width: 1280, height: 720, bitrate: 3000000 },
      { name: "480p", width: 854, height: 480, bitrate: 1500000 },
      { name: "360p", width: 640, height: 360, bitrate: 800000 }
    ],
    reason: buildReason({ looksLikePodcast, looksLikeCourse, isShortForm })
  };
}

function buildReason({ looksLikePodcast, looksLikeCourse, isShortForm }) {
  if (looksLikePodcast) {
    return "Filename suggests speech-heavy podcast content, so subtitles and highlights are useful.";
  }

  if (looksLikeCourse) {
    return "Filename suggests educational content, so subtitles are useful and moderation can stay standard.";
  }

  if (isShortForm) {
    return "Shorter upload, so highlight generation is enabled for the later clips pipeline.";
  }

  return "Default video workflow: HLS, thumbnail, and strict moderation.";
}

