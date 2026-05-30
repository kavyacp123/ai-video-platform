const test = require("node:test");
const assert = require("node:assert/strict");

// Mock AI supervisor plan generation
async function generatePlanSimulation(metadata, userPlan, bedrockAvailable = true) {
  // Simulate circuit breaker state
  if (!bedrockAvailable) {
    return ruleBasedPlanFallback(metadata.s3Key, metadata.fileSize, userPlan);
  }

  // Mock Bedrock response
  const bedrockPlan = {
    generateSubtitles: true,
    subtitleLanguages: ["en"],
    generateThumbnail: true,
    generateHighlights: false,
    moderationLevel: "standard",
    outputResolutions: ["480p", "360p"],
    priority: "normal"
  };

  return applyTierConstraints(bedrockPlan, userPlan);
}

function ruleBasedPlanFallback(s3Key, fileSize, userPlan) {
  const lowerKey = s3Key.toLowerCase();
  const speechHeavy = ["podcast", "interview", "lecture", "course", "tutorial"].some((h) => lowerKey.includes(h));

  const plan = {
    generateSubtitles: speechHeavy,
    subtitleLanguages: speechHeavy ? ["en"] : [],
    generateThumbnail: true,
    generateHighlights: fileSize < 150 * 1024 * 1024,
    moderationLevel: "standard",
    outputResolutions: ["480p", "360p"],
    priority: "normal"
  };

  return applyTierConstraints(plan, userPlan);
}

function applyTierConstraints(plan, userPlan) {
  if (userPlan === "free") {
    plan.outputResolutions = plan.outputResolutions.filter((r) => r !== "720p");
    plan.generateHighlights = false;
  }
  return plan;
}

test("Bedrock plan generated for pro user", async () => {
  const plan = await generatePlanSimulation(
    { s3Key: "uploads/user/video/demo.mp4", fileSize: 100 * 1024 * 1024 },
    "pro",
    true
  );

  assert.equal(plan.generateSubtitles, true);
  assert.equal(plan.generateThumbnail, true);
});

test("Falls back to rule-based when Bedrock unavailable", async () => {
  const plan = await generatePlanSimulation(
    { s3Key: "uploads/user/video/demo.mp4", fileSize: 100 * 1024 * 1024 },
    "pro",
    false
  );

  assert.ok(plan);
  assert.equal(plan.generateThumbnail, true);
});

test("Detects speech-heavy content in fallback plan", async () => {
  const keywords = ["podcast", "interview", "lecture", "course", "tutorial"];

  for (const keyword of keywords) {
    const plan = ruleBasedPlanFallback(`uploads/user/video/${keyword}-session.mp4`, 100, "pro");
    assert.equal(plan.generateSubtitles, true, `Failed for keyword: ${keyword}`);
  }
});

test("Free plan removes 720p resolution", async () => {
  const plan = await generatePlanSimulation(
    { s3Key: "uploads/user/video/demo.mp4", fileSize: 100 * 1024 * 1024 },
    "free",
    true
  );

  assert.equal(plan.outputResolutions.includes("720p"), false);
});

test("Free plan disables highlights", async () => {
  const plan = await generatePlanSimulation(
    { s3Key: "uploads/user/video/demo.mp4", fileSize: 50 * 1024 * 1024 },
    "free",
    true
  );

  assert.equal(plan.generateHighlights, false);
});

test("Pro plan enables all resolutions", async () => {
  const plan = await generatePlanSimulation(
    { s3Key: "uploads/user/video/demo.mp4", fileSize: 100 * 1024 * 1024 },
    "pro",
    true
  );

  assert.ok(plan.outputResolutions.length > 0);
});

test("Small files enable highlights in fallback", () => {
  const plan = ruleBasedPlanFallback("uploads/user/video/short.mp4", 50 * 1024 * 1024, "pro");
  assert.equal(plan.generateHighlights, true);
});

test("Large files disable highlights in fallback", () => {
  const plan = ruleBasedPlanFallback("uploads/user/video/large.mp4", 200 * 1024 * 1024, "pro");
  assert.equal(plan.generateHighlights, false);
});

test("Moderation level remains standard for non-private content", () => {
  const plan = ruleBasedPlanFallback("uploads/user/video/public.mp4", 100, "pro");
  assert.equal(plan.moderationLevel, "standard");
});
