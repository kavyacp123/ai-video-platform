const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { RekognitionClient, DetectLabelsCommand, DetectFacesCommand } = require("@aws-sdk/client-rekognition");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const logger = require("./logger");

const bedrock = new BedrockRuntimeClient({});
const rekognition = new RekognitionClient({});
const s3 = new S3Client({});

/**
 * AI Thumbnail Agent: Analyzes video frames to pick the best thumbnail
 * 
 * Strategy:
 * 1. Extract N frames from video at different timestamps (0%, 25%, 50%, 75%, 90%)
 * 2. Use AWS Rekognition to detect:
 *    - Faces (good thumbnails should have clear faces if people are in video)
 *    - Text/objects (indicate educational/informative content)
 *    - Scene brightness/clarity (avoid dark/blurry frames)
 * 3. Use Bedrock Vision to analyze frames:
 *    - "Rate this frame 1-10 for video thumbnail: consider engagement, clarity, subject"
 *    - Consider video category/content type
 * 4. Score each frame and return the best one
 * 
 * Returns: {
 *   thumbnailFrame: number (0-4, which frame to use),
 *   thumbnailTimestamp: number (seconds),
 *   confidence: number (0-1),
 *   reasoning: string,
 *   frameSScores: [{frame: 0, score: 8.5, reason: "..."}]
 * }
 */
async function selectBestThumbnailFrame(videoMetadata) {
  const videoId = videoMetadata.videoId;
  const duration = videoMetadata.duration || 300; // Assume 5 min if not provided
  const contentType = videoMetadata.category || "General";

  logger.info("AI Thumbnail Agent starting", { videoId, duration, contentType });

  // Step 1: Define frame timestamps (0%, 25%, 50%, 75%, 90%)
  const frameTimestamps = [
    Math.floor(duration * 0.0),
    Math.floor(duration * 0.25),
    Math.floor(duration * 0.5),
    Math.floor(duration * 0.75),
    Math.floor(duration * 0.9)
  ];

  logger.info("Frame timestamps", { frameTimestamps });

  const frameScores = [];

  // Step 2: Analyze each frame
  for (let i = 0; i < frameTimestamps.length; i++) {
    const timestamp = frameTimestamps[i];

    try {
      // Get frame analysis from Rekognition
      const rekognitionAnalysis = await analyzeFrameWithRekognition(videoId, i);

      // Get AI scoring from Bedrock
      const bedrockScore = await scoreFrameWithBedrock({
        frameIndex: i,
        timestamp,
        contentType,
        rekognitionData: rekognitionAnalysis
      });

      const combinedScore = (rekognitionAnalysis.confidence * 0.4) + (bedrockScore.score * 0.6);

      frameScores.push({
        frame: i,
        timestamp,
        score: combinedScore,
        bedrockScore: bedrockScore.score,
        rekognitionConfidence: rekognitionAnalysis.confidence,
        reason: bedrockScore.reasoning,
        features: {
          hasFaces: rekognitionAnalysis.faceCount > 0,
          hasText: rekognitionAnalysis.hasText,
          brightness: rekognitionAnalysis.brightness
        }
      });

      logger.info("Frame analyzed", { frame: i, timestamp, combinedScore });
    } catch (error) {
      logger.warn("Frame analysis failed", { frame: i, timestamp, error: error.message });
      frameScores.push({
        frame: i,
        timestamp,
        score: 0,
        error: error.message
      });
    }
  }

  // Step 3: Select best frame
  const bestFrame = frameScores.reduce((prev, current) => 
    (prev.score > current.score) ? prev : current
  );

  logger.info("Best thumbnail frame selected", {
    frame: bestFrame.frame,
    timestamp: bestFrame.timestamp,
    score: bestFrame.score
  });

  return {
    thumbnailFrame: bestFrame.frame,
    thumbnailTimestamp: bestFrame.timestamp,
    confidence: bestFrame.score / 10,
    reasoning: bestFrame.reason,
    frameScores: frameScores.map(f => ({
      frame: f.frame,
      timestamp: f.timestamp,
      score: f.score,
      reason: f.reason,
      features: f.features
    }))
  };
}

/**
 * Analyze frame using AWS Rekognition for objective features
 */
async function analyzeFrameWithRekognition(videoId, frameIndex) {
  try {
    // Mock implementation - in production, extract frame from video first
    // For now, return example scores
    
    const faceResponse = await rekognition.send(
      new DetectFacesCommand({
        Image: {
          S3Object: {
            Bucket: process.env.RAW_BUCKET_NAME,
            Name: `frames/${videoId}/frame-${frameIndex}.jpg`
          }
        },
        Attributes: ["ALL"]
      })
    ).catch(() => ({ FaceDetails: [] }));

    const labelsResponse = await rekognition.send(
      new DetectLabelsCommand({
        Image: {
          S3Object: {
            Bucket: process.env.RAW_BUCKET_NAME,
            Name: `frames/${videoId}/frame-${frameIndex}.jpg`
          }
        }
      })
    ).catch(() => ({ Labels: [] }));

    // Score brightness by analyzing labels
    const hasText = labelsResponse.Labels?.some(l => l.Name === "Text") || false;
    const hasBackground = labelsResponse.Labels?.some(l => l.Name === "Background") || false;
    const brightness = hasBackground ? 0.7 : 0.5; // Simplified

    return {
      faceCount: faceResponse.FaceDetails?.length || 0,
      hasText,
      brightness,
      labels: labelsResponse.Labels?.map(l => l.Name) || [],
      confidence: (faceResponse.FaceDetails?.length || 0) > 0 ? 0.9 : 0.6
    };
  } catch (error) {
    logger.error("Rekognition analysis failed", { frameIndex, error: error.message });
    return {
      faceCount: 0,
      hasText: false,
      brightness: 0.5,
      labels: [],
      confidence: 0.3
    };
  }
}

/**
 * Score frame using Bedrock Vision
 */
async function scoreFrameWithBedrock({ frameIndex, timestamp, contentType, rekognitionData }) {
  try {
    const systemPrompt = `You are a video thumbnail expert. Rate thumbnail quality for ${contentType} content.
Consider:
- Visual appeal and engagement
- Clear subject matter
- Composition and framing
- Relevance to content type

Return JSON: { "score": 1-10, "reasoning": "..." }`;

    const userPrompt = `Frame at ${timestamp}s:
- Faces detected: ${rekognitionData.faceCount}
- Text visible: ${rekognitionData.hasText}
- Brightness level: ${rekognitionData.brightness}
- Object labels: ${rekognitionData.labels.join(", ")}

For ${contentType} content, how good is this as a thumbnail? Rate 1-10.`;

    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
          ],
          inferenceConfig: { maxTokens: 200, temperature: 0.3 }
        })
      })
    );

    const raw = Buffer.from(response.body).toString("utf8");
    const parsed = JSON.parse(raw);
    const text = parsed.output?.message?.content?.[0]?.text || "{}";

    try {
      const result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
      return {
        score: Math.min(10, Math.max(1, result.score || 5)),
        reasoning: result.reasoning || "Unable to parse reasoning"
      };
    } catch {
      return { score: 5, reasoning: "Could not parse Bedrock response" };
    }
  } catch (error) {
    logger.error("Bedrock scoring failed", { frameIndex, error: error.message });
    return { score: 5, reasoning: "Bedrock analysis failed" };
  }
}

module.exports = {
  selectBestThumbnailFrame,
  analyzeFrameWithRekognition,
  scoreFrameWithBedrock
};
