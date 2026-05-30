const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { appendProcessingEvent, updateVideoStatus, getVideo } = require("../../shared/dynamoService");
const { identifyHighlightSegments } = require("../../shared/clipsAgent");
const logger = require("../../shared/logger");

const sqs = new SQSClient({});

/**
 * Generate Clips/Highlights Handler
 * 
 * Flow:
 * 1. If AI highlight selection enabled: use AI agent to identify best segments
 *    - Analyzes transcript (if available)
 *    - Detects scenes/action moments
 *    - Scores segments for engagement
 * 2. Queue FFmpeg worker jobs for each identified clip
 * 3. Store clip metadata in video record
 * 
 * Old behavior: Always creates 1 hardcoded clip from 0-15 seconds
 * New behavior: AI identifies 3-5 optimal highlight segments based on content
 */
exports.handler = async (input) => {
  try {
    if (!input.plan.generateHighlights) {
      logger.info("Highlight generation skipped", { videoId: input.videoId });
      return { ...input, clipsSkipped: true };
    }

    const videoId = input.videoId;
    let clips = [];

    // Try AI clip identification if enabled
    if (process.env.ENABLE_AI_CLIP_SELECTION === "true") {
      try {
        const video = await getVideo(videoId);
        if (video) {
          const highlightAnalysis = await identifyHighlightSegments({
            videoId: video.videoId,
            duration: video.duration || 300,
            category: video.category || "General",
            transcriptText: video.transcriptText || null,
            transcriptS3Key: video.transcriptS3Key || null
          });

          clips = highlightAnalysis.clips;

          logger.info("AI clip selection completed", {
            videoId,
            clipCount: clips.length,
            strategy: highlightAnalysis.strategy,
            confidence: clips[0]?.confidence || 0
          });
        }
      } catch (error) {
        logger.warn("AI clip selection failed, using default", {
          videoId,
          error: error.message
        });
        // Fall through to default clips
      }
    }

    // If no clips from AI, use defaults
    if (clips.length === 0) {
      clips = generateDefaultClips(input);
    }

    // Queue FFmpeg worker job for each clip
    const queuedClips = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipId = `clip-${i + 1}`;

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.TRANSCODE_QUEUE_URL,
          MessageGroupId: videoId,
          MessageDeduplicationId: `${videoId}-clip-${i}-${Date.now()}`,
          MessageBody: JSON.stringify({
            jobType: "CLIP_GENERATION",
            videoId: videoId,
            userId: input.userId,
            clipId: clipId,
            clipIndex: i,
            title: clip.title,
            startSeconds: clip.startSeconds,
            endSeconds: clip.endSeconds,
            sourceBucket: input.rawBucket || process.env.RAW_BUCKET_NAME,
            s3Key: input.s3Key,
            outputBucket: process.env.PROCESSED_BUCKET_NAME,
            taskToken: input.taskToken,
            aiSelected: process.env.ENABLE_AI_CLIP_SELECTION === "true",
            confidence: clip.confidence,
            reasoning: clip.reasoning
          })
        })
      );

      queuedClips.push({
        clipId,
        title: clip.title,
        startSeconds: clip.startSeconds,
        endSeconds: clip.endSeconds,
        s3Key: `clips/${videoId}/${clipId}.mp4`,
        confidence: clip.confidence,
        reasoning: clip.reasoning,
        queued: true
      });

      logger.info("Clip queued", {
        videoId,
        clipId,
        title: clip.title,
        duration: clip.endSeconds - clip.startSeconds
      });
    }

    // Store clips metadata in video record
    await updateVideoStatus(videoId, "PROCESSING", {
      clips: queuedClips,
      clipSelectionMethod: process.env.ENABLE_AI_CLIP_SELECTION === "true" ? "ai-identified" : "default",
      totalClips: queuedClips.length
    });

    await appendProcessingEvent(
      videoId,
      "CLIPS_QUEUED",
      `${queuedClips.length} highlight clips queued for generation`
    );

    logger.info("Clips queued successfully", {
      videoId,
      clipCount: queuedClips.length,
      method: process.env.ENABLE_AI_CLIP_SELECTION === "true" ? "ai-identified" : "default"
    });

    return { ...input, clips: queuedClips, clipCount: queuedClips.length };
  } catch (error) {
    logger.error("Clip generation failed", { videoId: input.videoId, error: error.message });
    throw error;
  }
};

/**
 * Generate default clips (fallback)
 */
function generateDefaultClips(input) {
  const duration = input.duration || 300;
  return [
    {
      title: "Opening highlight",
      startSeconds: 0,
      endSeconds: 30,
      confidence: 0.6,
      reasoning: "Auto-generated: Opening segment"
    },
    {
      title: "Mid-point highlight",
      startSeconds: Math.floor(duration * 0.35),
      endSeconds: Math.floor(duration * 0.35) + 30,
      confidence: 0.5,
      reasoning: "Auto-generated: Middle segment"
    }
  ];
}
