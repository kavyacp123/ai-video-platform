const { RekognitionClient, DetectModerationLabelsCommand } = require("@aws-sdk/client-rekognition");
const { publish } = require("../../shared/eventPublisher");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");

const rekognition = new RekognitionClient({});

exports.handler = async (input) => {
  if (input.moderationSkipped) return input;

  const minConfidence = input.plan.moderationLevel === "strict" ? 60 : 75;
  const flags = [];

  for (const key of input.frameS3Keys || []) {
    try {
      const result = await rekognition.send(
        new DetectModerationLabelsCommand({
          Image: { S3Object: { Bucket: process.env.THUMBNAIL_BUCKET_NAME, Name: key } },
          MinConfidence: minConfidence
        })
      );
      flags.push(...(result.ModerationLabels || []).map((label) => label.Name));
    } catch (error) {
      flags.push("FRAME_NOT_AVAILABLE_FOR_SKELETON");
      break;
    }
  }

  const uniqueFlags = [...new Set(flags)].filter(Boolean);
  const decision = uniqueFlags.length === 0 ? "APPROVE" : input.plan.moderationLevel === "strict" ? "REVIEW" : "APPROVE";

  if (decision === "REVIEW") {
    await updateVideoStatus(input.videoId, VIDEO_STATUS.REVIEW_REQUIRED, { moderation: { decision, flags: uniqueFlags } });
  }

  await appendProcessingEvent(input.videoId, EVENT_TYPES.MODERATION_COMPLETE, `Moderation decision: ${decision}`);
  await publish(EVENT_TYPES.MODERATION_COMPLETE, {
    videoId: input.videoId,
    userId: input.userId,
    decision,
    flags: uniqueFlags
  });
  return { ...input, moderation: { decision, flags: uniqueFlags } };
};

