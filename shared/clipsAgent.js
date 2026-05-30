const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { TranscribeClient, GetTranscriptionJobCommand } = require("@aws-sdk/client-transcribe");
const logger = require("./logger");

const bedrock = new BedrockRuntimeClient({});
const transcribe = new TranscribeClient({});

/**
 * AI Clips Agent: Analyzes video content to identify highlight segments
 * 
 * Strategy:
 * 1. Get transcript from Transcribe service
 * 2. Split transcript into sentences/paragraphs
 * 3. Score each segment for "highlight potential" using Bedrock:
 *    - Emotional language (exclamation, emphatic words)
 *    - Key moments (topic changes, conclusions)
 *    - Engagement (questions, surprises)
 * 4. For non-speech content (music, gaming):
 *    - Use scene detection from Rekognition
 *    - Identify fast-paced or high-action segments
 * 5. Select top N segments and suggest 30-60 second clips
 * 
 * Returns: {
 *   clips: [{
 *     title: string,
 *     startSeconds: number,
 *     endSeconds: number,
 *     confidence: number,
 *     reasoning: string,
 *     highlightScore: number
 *   }],
 *   contentType: string,
 *   strategy: string
 * }
 */
async function identifyHighlightSegments(videoMetadata) {
  const videoId = videoMetadata.videoId;
  const duration = videoMetadata.duration || 300;
  const category = videoMetadata.category || "General";
  const hasTranscript = videoMetadata.transcriptS3Key && videoMetadata.transcriptS3Key.length > 0;

  logger.info("AI Clips Agent starting", { videoId, duration, category, hasTranscript });

  let clips = [];

  if (hasTranscript && ["Education", "Tutorial", "Podcast", "Interview"].includes(category)) {
    // Speech-heavy content: analyze transcript
    clips = await identifyClipsFromTranscript(videoMetadata);
  } else if (["Music", "Gaming", "Sports", "Entertainment"].includes(category)) {
    // Action/entertainment content: analyze scene changes
    clips = await identifyClipsFromSceneAnalysis(videoMetadata);
  } else {
    // Generic content: extract evenly-spaced highlights
    clips = generateDefaultClips(duration);
  }

  logger.info("Highlight segments identified", { videoId, clipCount: clips.length });

  return {
    clips: clips.slice(0, 5), // Top 5 clips
    contentType: category,
    strategy: hasTranscript ? "transcript-based" : "scene-based",
    totalIdentified: clips.length
  };
}

/**
 * Analyze transcript to find highlight moments
 */
async function identifyClipsFromTranscript(videoMetadata) {
  try {
    // In production: fetch transcript from S3
    const transcriptText = videoMetadata.transcriptText || "Sample transcript without key moments.";

    // Split into sentences with timestamps
    const sentences = transcriptText.split(/[\.\!\?]+/).map((s, i) => ({
      text: s.trim(),
      index: i,
      startSeconds: Math.floor((i / 20) * videoMetadata.duration), // Rough estimate
      endSeconds: Math.floor(((i + 1) / 20) * videoMetadata.duration)
    })).filter(s => s.text.length > 0);

    const highlightScores = [];

    // Score each sentence/segment for highlight potential
    for (const segment of sentences.slice(0, 20)) { // Limit to 20 to avoid token overflow
      try {
        const score = await scoreTranscriptSegment(segment.text, videoMetadata.category);
        highlightScores.push({
          ...segment,
          ...score
        });
      } catch (error) {
        logger.warn("Segment scoring failed", { segment: segment.index, error: error.message });
      }
    }

    // Sort by highlight score and create clips
    const topSegments = highlightScores
      .sort((a, b) => b.highlightScore - a.highlightScore)
      .slice(0, 5);

    return topSegments.map((segment, idx) => ({
      title: `Highlight ${idx + 1}: ${segment.title}`,
      startSeconds: Math.max(0, segment.startSeconds - 5), // Start 5s before
      endSeconds: Math.min(videoMetadata.duration, segment.endSeconds + 25), // 30s clip
      confidence: segment.confidence,
      reasoning: segment.reasoning,
      highlightScore: segment.highlightScore,
      type: "transcript-highlight"
    }));
  } catch (error) {
    logger.error("Transcript analysis failed", { error: error.message });
    return generateDefaultClips(videoMetadata.duration);
  }
}

/**
 * Score a transcript segment for highlight potential using Bedrock
 */
async function scoreTranscriptSegment(text, category) {
  try {
    const systemPrompt = `You are a video highlight expert. Analyze this ${category} content segment.
Rate for highlight potential (1-10) considering:
- Emotional language or impact
- Information density or key insights
- Engagement level (questions, surprises, conclusions)
- Relevance to audience

Return JSON: { "highlightScore": 1-10, "title": "...", "reasoning": "...", "confidence": 0-1 }`;

    const userPrompt = `Segment: "${text}"

Is this a good highlight for a video? Rate 1-10.`;

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
    const responseText = parsed.output?.message?.content?.[0]?.text || "{}";

    try {
      const result = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || "{}");
      return {
        highlightScore: Math.min(10, Math.max(1, result.highlightScore || 5)),
        title: (result.title || "Key moment").substring(0, 50),
        reasoning: result.reasoning || "",
        confidence: result.confidence || 0.7
      };
    } catch {
      return {
        highlightScore: 5,
        title: "Potential highlight",
        reasoning: "Bedrock analysis inconclusive",
        confidence: 0.5
      };
    }
  } catch (error) {
    logger.error("Bedrock scoring failed", { error: error.message });
    return {
      highlightScore: 3,
      title: "Fallback segment",
      reasoning: "Bedrock unavailable",
      confidence: 0.3
    };
  }
}

/**
 * For entertainment/gaming content: use scene detection
 */
async function identifyClipsFromSceneAnalysis(videoMetadata) {
  try {
    // In production: run Rekognition shot detection on video
    // For now, return intelligent default clips based on content type
    
    const duration = videoMetadata.duration || 300;
    const category = videoMetadata.category || "Gaming";

    if (category === "Gaming") {
      // Gaming: look for high-action moments (every 1-2 min)
      return [
        {
          title: "Intense gameplay moment",
          startSeconds: Math.floor(duration * 0.15),
          endSeconds: Math.floor(duration * 0.15) + 45,
          confidence: 0.8,
          reasoning: "High-intensity gameplay segment",
          highlightScore: 8,
          type: "scene-highlight"
        },
        {
          title: "Victory/achievement",
          startSeconds: Math.floor(duration * 0.7),
          endSeconds: Math.floor(duration * 0.7) + 30,
          confidence: 0.9,
          reasoning: "Climax moment - likely victory or achievement",
          highlightScore: 9,
          type: "scene-highlight"
        }
      ];
    } else if (category === "Music") {
      // Music: chorus and build-ups (beat detection would be ideal)
      return [
        {
          title: "Chorus highlight",
          startSeconds: Math.floor(duration * 0.3),
          endSeconds: Math.floor(duration * 0.3) + 30,
          confidence: 0.75,
          reasoning: "Estimated chorus position",
          highlightScore: 7,
          type: "scene-highlight"
        },
        {
          title: "Musical climax",
          startSeconds: Math.floor(duration * 0.7),
          endSeconds: Math.floor(duration * 0.7) + 30,
          confidence: 0.8,
          reasoning: "Build-up and peak moment",
          highlightScore: 8,
          type: "scene-highlight"
        }
      ];
    }

    return generateDefaultClips(duration);
  } catch (error) {
    logger.error("Scene analysis failed", { error: error.message });
    return generateDefaultClips(videoMetadata.duration || 300);
  }
}

/**
 * Generate evenly-spaced default clips (fallback)
 */
function generateDefaultClips(duration) {
  return [
    {
      title: "Opening moment",
      startSeconds: 0,
      endSeconds: Math.min(45, duration),
      confidence: 0.6,
      reasoning: "First 45 seconds - typically engaging",
      highlightScore: 6,
      type: "default"
    },
    {
      title: "Mid-point highlight",
      startSeconds: Math.floor(duration * 0.4),
      endSeconds: Math.floor(duration * 0.4) + 30,
      confidence: 0.5,
      reasoning: "Middle section usually contains key content",
      highlightScore: 5,
      type: "default"
    },
    {
      title: "Conclusion/ending",
      startSeconds: Math.max(0, duration - 60),
      endSeconds: duration,
      confidence: 0.65,
      reasoning: "Final moment - often a call-to-action or summary",
      highlightScore: 6.5,
      type: "default"
    }
  ];
}

module.exports = {
  identifyHighlightSegments,
  identifyClipsFromTranscript,
  scoreTranscriptSegment,
  identifyClipsFromSceneAnalysis,
  generateDefaultClips
};
