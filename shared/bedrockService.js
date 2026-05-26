const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { fallbackPlan, validateProcessingPlan } = require("./processingPlan");

const client = new BedrockRuntimeClient({});

const SYSTEM_PROMPT =
  "You are a video processing orchestrator. Analyze the video metadata and return ONLY a JSON object — no explanation, no markdown. JSON must match this exact shape: { generateSubtitles: bool, subtitleLanguages: [string], generateThumbnail: bool, generateHighlights: bool, moderationLevel: 'none'|'standard'|'strict', outputResolutions: ['720p'|'480p'|'360p'], priority: 'low'|'normal'|'high' }";

async function generatePlanWithBedrock({ metadata, userPlan }) {
  const modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
  const userPrompt = `Video metadata: fileSize=${metadata.fileSize}bytes, contentType=${metadata.contentType}, userId=${metadata.userId}, userPlan=${userPlan}. Decide the processing plan.`;

  const response = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }]
          }
        ],
        inferenceConfig: { maxTokens: 300, temperature: 0.1 }
      })
    })
  );

  const raw = Buffer.from(response.body).toString("utf8");
  const parsed = JSON.parse(raw);
  const text = parsed.output?.message?.content?.[0]?.text || parsed.content?.[0]?.text || raw;
  return parsePlanText(text);
}

function parsePlanText(text) {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const json = jsonStart >= 0 && jsonEnd >= 0 ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
    return validateProcessingPlan(JSON.parse(json));
  } catch {
    return fallbackPlan();
  }
}

module.exports = {
  generatePlanWithBedrock,
  parsePlanText
};

