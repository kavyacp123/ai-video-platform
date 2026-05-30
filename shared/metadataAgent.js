const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const bedrock = new BedrockRuntimeClient({});

const FALLBACK_CATEGORY = "General";

async function generateMetadataWithBedrock({ video, plan, pipelineResults }) {
  const modelId = process.env.BEDROCK_METADATA_MODEL_ID || process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
  const systemPrompt =
    "You are a video metadata agent. Return ONLY valid JSON, no markdown. JSON shape: { title: string, description: string, tags: [string], category: string }. Keep title under 90 characters, description under 500 characters, tags lowercase and useful.";
  const userPrompt = [
    `Video id: ${video.videoId}`,
    `Raw key: ${video.rawS3Key || video.s3Key || "unknown"}`,
    `Content type: ${video.contentType || "video/*"}`,
    `File size: ${video.fileSize || "unknown"} bytes`,
    `Processing plan: ${JSON.stringify(plan || {})}`,
    `Pipeline outputs: ${JSON.stringify(summarizePipelineResults(pipelineResults))}`
  ].join("\n");

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        inferenceConfig: { maxTokens: 400, temperature: 0.2 }
      })
    })
  );

  const raw = Buffer.from(response.body).toString("utf8");
  const parsed = JSON.parse(raw);
  const text = parsed.output?.message?.content?.[0]?.text || parsed.content?.[0]?.text || raw;
  return parseMetadataText(text, video);
}

function parseMetadataText(text, video = {}) {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const json = jsonStart >= 0 && jsonEnd >= 0 ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
    return validateMetadata(JSON.parse(json), video);
  } catch {
    return fallbackMetadata(video);
  }
}

function validateMetadata(value, video = {}) {
  const fallback = fallbackMetadata(video);
  const title = cleanText(value?.title, fallback.title).slice(0, 90);
  const description = cleanText(value?.description, fallback.description).slice(0, 500);
  const tags = Array.isArray(value?.tags)
    ? value.tags
        .map((tag) => cleanTag(tag))
        .filter(Boolean)
        .slice(0, 8)
    : fallback.tags;
  const category = cleanText(value?.category, fallback.category).slice(0, 60);

  return {
    title,
    description,
    tags: tags.length ? [...new Set(tags)] : fallback.tags,
    category
  };
}

function fallbackMetadata(video = {}) {
  const key = video.rawS3Key || video.s3Key || "";
  const filename = key.split("/").pop() || video.videoId || "uploaded-video";
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const title = titleCase(base || "Untitled Video");
  const inferredTags = base
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .slice(0, 5);

  return {
    title,
    description: `Auto-generated video metadata for ${title}.`,
    tags: inferredTags.length ? inferredTags : ["video", "upload"],
    category: inferCategory(base)
  };
}

function summarizePipelineResults(results = []) {
  return results.map((result) => ({
    subtitles: Boolean(result?.subtitles),
    moderation: result?.moderation,
    thumbnailUrl: result?.thumbnailUrl,
    clips: Array.isArray(result?.clips) ? result.clips.length : 0,
    hlsS3Key: result?.hlsS3Key
  }));
}

function cleanText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanTag(value) {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "")
        .trim()
    : "";
}

function inferCategory(text = "") {
  const normalized = text.toLowerCase();
  if (/(lecture|course|tutorial|class|system design|architecture|demo)/.test(normalized)) return "Education";
  if (/(podcast|interview|talk|conversation)/.test(normalized)) return "Podcast";
  if (/(game|stream|match|sport)/.test(normalized)) return "Entertainment";
  return FALLBACK_CATEGORY;
}

function titleCase(value) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

module.exports = {
  generateMetadataWithBedrock,
  parseMetadataText,
  validateMetadata,
  fallbackMetadata
};
