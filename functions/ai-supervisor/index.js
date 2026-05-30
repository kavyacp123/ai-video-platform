const { getUserProfile, updateVideoStatus, markIdempotency, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { parseEventBridge, requireFields } = require("../../shared/eventParser");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");
const { generatePlanWithBedrock } = require("../../shared/bedrockService");
const { fallbackPlan, ruleBasedPlan, applyBusinessRules } = require("../../shared/processingPlan");
const circuitBreaker = require("../../shared/circuitBreaker");
const logger = require("../../shared/logger");

/**
 * AI Supervisor: Orchestrates video processing pipeline strategy
 *
 * Triggered by S3 ObjectCreated events via EventBridge.
 * Generates an optimal video processing plan using AWS Bedrock (with circuit breaker fallback).
 * Updates video status to AI_PLAN_CREATED and publishes event for pipeline orchestration.
 *
 * Flow:
 * 1. Normalize S3 event from EventBridge
 * 2. Mark event as processed (idempotency)
 * 3. Fetch user tier to determine constraints
 * 4. Call Bedrock AI (Nova Lite) to generate processing plan
 * 5. If Bedrock fails/unavailable: use rule-based fallback
 * 6. Apply business rules (tier-based feature restrictions)
 * 7. Update video status and publish AI_PLAN_CREATED event
 * 8. Pipeline picks up from there
 *
 * @param {Object} event - EventBridge event from S3:ObjectCreated notification
 * @param {string} event.id - EventBridge event ID (for idempotency)
 * @param {string} event.source - Should be "aws.s3"
 * @param {Object} event.detail.object.key - S3 key path in format: uploads/{userId}/{videoId}/{filename}
 *
 * @returns {Promise<void>}
 *
 * Throws:
 * - If required fields missing (videoId, userId, s3Key)
 * - If Bedrock AND rule-based fallback fail
 * - Publishes VIDEO_FAILED event on error
 *
 * Processing Plan Structure:
 * {
 *   generateSubtitles: bool,
 *   subtitleLanguages: ["en", "es", ...],
 *   generateThumbnail: bool,
 *   generateHighlights: bool,
 *   moderationLevel: "none" | "standard" | "strict",
 *   outputResolutions: ["720p", "480p", "360p"],
 *   priority: "low" | "normal" | "high"
 * }
 *
 * Circuit Breaker:
 * - CLOSED: Normal - call Bedrock
 * - OPEN: Bedrock failing - use fallback
 * - HALF_OPEN: Testing recovery
 * Threshold: 5 failures, resets after 60 seconds
 */
exports.handler = async (event) => {
  const startedAt = Date.now();
  let detail;

  try {
    detail = normalizeUploadEvent(event);
    requireFields(detail, ["eventId", "videoId", "userId", "s3Key", "fileSize", "contentType"]);

    try {
      await markIdempotency(detail.eventId);
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        logger.info("Duplicate event skipped", { eventId: detail.eventId, videoId: detail.videoId });
        return;
      }
      throw error;
    }

    await updateVideoStatus(detail.videoId, VIDEO_STATUS.ANALYZING);
    const user = await getUserProfile(detail.userId);
    const userPlan = user?.plan || "free";
    const metadata = {
      videoId: detail.videoId,
      s3Key: detail.s3Key,
      fileSize: detail.fileSize,
      contentType: detail.contentType
    };

    let plan;
    const breaker = await circuitBreaker.beforeCall();
    if (process.env.ENABLE_BEDROCK_SUPERVISOR === "true" && breaker.allowed) {
      try {
        plan = await generatePlanWithBedrock({ metadata: { ...metadata, userId: detail.userId }, userPlan });
        await circuitBreaker.recordSuccess();
      } catch (error) {
        const nextBreaker = await circuitBreaker.recordFailure();
        logger.warn("Bedrock plan failed, using rules", { videoId: detail.videoId, error: error.message });
        plan = nextBreaker.state === "OPEN" ? fallbackPlan() : ruleBasedPlan({ s3Key: detail.s3Key, fileSize: detail.fileSize, userPlan });
      }
    } else {
      logger.warn("Bedrock circuit open or disabled, using fallback/rules", {
        videoId: detail.videoId,
        circuitBreaker: breaker.state?.state
      });
      plan =
        breaker.state?.state === "OPEN"
          ? fallbackPlan()
          : ruleBasedPlan({ s3Key: detail.s3Key, fileSize: detail.fileSize, userPlan });
    }

    plan = applyBusinessRules(plan, userPlan);

    await updateVideoStatus(detail.videoId, "AI_PLAN_CREATED", { processingPlan: plan });
    await appendProcessingEvent(detail.videoId, EVENT_TYPES.AI_PLAN_CREATED, "Supervisor created processing plan.");
    await publish(EVENT_TYPES.AI_PLAN_CREATED, {
      videoId: detail.videoId,
      userId: detail.userId,
      s3Key: detail.s3Key,
      rawBucket: detail.rawBucket || process.env.RAW_BUCKET_NAME,
      plan,
      eventId: detail.eventId,
      fileSize: detail.fileSize
    });

    logger.info("Supervisor completed", {
      videoId: detail.videoId,
      plan,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    logger.error("Supervisor failed", { error: error.message, videoId: detail?.videoId });
    if (detail?.videoId) {
      await publish(EVENT_TYPES.VIDEO_FAILED, {
        videoId: detail.videoId,
        userId: detail.userId,
        stage: "AI_SUPERVISOR",
        error: error.message,
        retryable: true
      }).catch(() => {});
    }
    throw error;
  }
};

function normalizeUploadEvent(event) {
  if (event.source === "aws.s3" && event.detail?.object?.key) {
    const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, " "));
    const parts = key.split("/");
    return {
      eventId: event.id,
      videoId: parts[2],
      userId: parts[1],
      s3Key: key,
      rawBucket: event.detail.bucket.name,
      fileSize: event.detail.object.size || 0,
      contentType: "video/*"
    };
  }

  return parseEventBridge(event, EVENT_TYPES.VIDEO_UPLOADED);
}
