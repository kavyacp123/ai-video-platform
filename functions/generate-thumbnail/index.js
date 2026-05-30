const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { updateVideoStatus, appendProcessingEvent, getVideo } = require("../../shared/dynamoService");
const { selectBestThumbnailFrame } = require("../../shared/thumbnailAgent");
const logger = require("../../shared/logger");

const sqs = new SQSClient({});

/**
 * Generate Thumbnail Handler
 * 
 * Flow:
 * 1. If AI thumbnail selection enabled: use AI agent to pick best frame
 * 2. Queue FFmpeg worker to extract that frame at optimal timestamp
 * 3. Return frame index to worker for processing
 * 
 * Old behavior: Always extract frame at 0:00
 * New behavior: AI analyzes 5 frames (0%, 25%, 50%, 75%, 90%) and picks best
 */
exports.handler = async (input) => {
  try {
    if (!input.plan.generateThumbnail) {
      logger.info("Thumbnail generation skipped", { videoId: input.videoId });
      return { ...input, thumbnailSkipped: true };
    }

    const videoId = input.videoId;
    let frameTimestamp = 0; // Default: frame at 0 seconds
    let frameSelection = { method: "default" };

    // Try AI frame selection if enabled
    if (process.env.ENABLE_AI_THUMBNAIL_SELECTION === "true") {
      try {
        const video = await getVideo(videoId);
        if (video) {
          frameSelection = await selectBestThumbnailFrame({
            videoId: video.videoId,
            duration: video.duration || 300,
            category: video.category || "General"
          });

          frameTimestamp = frameSelection.thumbnailTimestamp;

          logger.info("AI thumbnail selection", {
            videoId,
            selectedFrame: frameSelection.thumbnailFrame,
            timestamp: frameTimestamp,
            confidence: frameSelection.confidence,
            reasoning: frameSelection.reasoning
          });
        }
      } catch (error) {
        logger.warn("AI thumbnail selection failed, using default", {
          videoId,
          error: error.message
        });
        frameTimestamp = 0;
      }
    }

    const thumbnailUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/thumbnails/${videoId}/poster.jpg`;

    // Queue FFmpeg worker to extract frame at optimal timestamp
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.TRANSCODE_QUEUE_URL,
        MessageGroupId: videoId,
        MessageDeduplicationId: `${videoId}-thumbnail-${Date.now()}`,
        MessageBody: JSON.stringify({
          jobType: "THUMBNAIL",
          videoId: videoId,
          userId: input.userId,
          sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
          s3Key: input.s3Key,
          outputBucket: process.env.THUMBNAIL_BUCKET_NAME,
          frameTimestamp: frameTimestamp, // NEW: AI-selected timestamp
          frameIndex: frameSelection.thumbnailFrame || 0, // NEW: which frame was selected
          taskToken: input.taskToken,
          aiSelected: process.env.ENABLE_AI_THUMBNAIL_SELECTION === "true"
        })
      })
    );

    await updateVideoStatus(videoId, "PROCESSING", {
      thumbnailUrl,
      thumbnailSelection: frameSelection
    });

    await appendProcessingEvent(
      videoId,
      "THUMBNAIL_QUEUED",
      `Thumbnail generation queued at ${frameTimestamp}s (${frameSelection.method || "default"})`
    );

    logger.info("Thumbnail queued successfully", {
      videoId,
      frameTimestamp,
      method: frameSelection.method
    });

    return { ...input, thumbnailUrl, frameSelection };
  } catch (error) {
    logger.error("Thumbnail generation failed", { videoId: input.videoId, error: error.message });
    throw error;
  }
};
