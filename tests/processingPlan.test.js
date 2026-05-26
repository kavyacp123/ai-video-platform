const test = require("node:test");
const assert = require("node:assert/strict");
const { ruleBasedPlan, applyBusinessRules, validateProcessingPlan } = require("../shared/processingPlan");

test("free plan removes 720p and highlights", () => {
  const plan = applyBusinessRules(
    {
      generateSubtitles: true,
      subtitleLanguages: ["en"],
      generateThumbnail: true,
      generateHighlights: true,
      moderationLevel: "strict",
      outputResolutions: ["720p", "480p"],
      priority: "high"
    },
    "free"
  );

  assert.deepEqual(plan.outputResolutions, ["480p"]);
  assert.equal(plan.generateHighlights, false);
});

test("rule-based plan enables subtitles for lecture filenames", () => {
  const plan = ruleBasedPlan({ s3Key: "uploads/u/v/aws-lecture.mp4", fileSize: 10, userPlan: "paid" });
  assert.equal(plan.generateSubtitles, true);
  assert.equal(plan.outputResolutions.includes("720p"), true);
});

test("invalid plan is normalized", () => {
  const plan = validateProcessingPlan({ moderationLevel: "wild", outputResolutions: ["1080p"] });
  assert.equal(plan.moderationLevel, "standard");
  assert.deepEqual(plan.outputResolutions, ["480p"]);
});

