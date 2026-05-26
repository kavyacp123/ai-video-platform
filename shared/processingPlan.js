const validResolutions = new Set(["720p", "480p", "360p"]);

function fallbackPlan() {
  return {
    generateSubtitles: false,
    subtitleLanguages: [],
    generateThumbnail: true,
    generateHighlights: false,
    moderationLevel: "standard",
    outputResolutions: ["480p"],
    priority: "normal",
    reason: "Fallback rule-based plan because AI reasoning was unavailable."
  };
}

function ruleBasedPlan({ s3Key = "", fileSize = 0, userPlan = "free" }) {
  const lowerKey = s3Key.toLowerCase();
  const speechHeavy = ["podcast", "interview", "lecture", "course", "tutorial"].some((hint) =>
    lowerKey.includes(hint)
  );
  const paid = userPlan !== "free";
  const smallEnoughForHighlights = fileSize > 0 && fileSize < 150 * 1024 * 1024;

  return applyBusinessRules(
    {
      generateSubtitles: speechHeavy,
      subtitleLanguages: speechHeavy ? ["en", "hi"] : [],
      generateThumbnail: true,
      generateHighlights: smallEnoughForHighlights,
      moderationLevel: lowerKey.includes("private") ? "standard" : "strict",
      outputResolutions: paid ? ["720p", "480p", "360p"] : ["480p", "360p"],
      priority: paid ? "high" : "normal",
      reason: speechHeavy
        ? "Speech-heavy filename detected, enabling subtitles and standard delivery pipeline."
        : "Default upload profile, enabling HLS, thumbnail, and moderation."
    },
    userPlan
  );
}

function validateProcessingPlan(plan) {
  const normalized = { ...fallbackPlan(), ...plan };
  normalized.outputResolutions = (normalized.outputResolutions || []).filter((value) => validResolutions.has(value));

  if (normalized.outputResolutions.length === 0) {
    normalized.outputResolutions = ["480p"];
  }

  if (!["none", "standard", "strict"].includes(normalized.moderationLevel)) {
    normalized.moderationLevel = "standard";
  }

  if (!["low", "normal", "high"].includes(normalized.priority)) {
    normalized.priority = "normal";
  }

  normalized.subtitleLanguages = Array.isArray(normalized.subtitleLanguages) ? normalized.subtitleLanguages : [];
  return normalized;
}

function applyBusinessRules(plan, userPlan = "free") {
  const normalized = validateProcessingPlan(plan);

  if (userPlan === "free") {
    normalized.outputResolutions = normalized.outputResolutions.filter((resolution) => resolution !== "720p");
    normalized.generateHighlights = false;

    if (normalized.outputResolutions.length === 0) {
      normalized.outputResolutions = ["480p"];
    }
  }

  return normalized;
}

function resolutionToRendition(resolution) {
  const map = {
    "720p": { name: "720p", width: 1280, height: 720, bitrate: 4500000, audioBitrate: 192000 },
    "480p": { name: "480p", width: 854, height: 480, bitrate: 2000000, audioBitrate: 128000 },
    "360p": { name: "360p", width: 640, height: 360, bitrate: 800000, audioBitrate: 96000 }
  };
  return map[resolution] || map["480p"];
}

module.exports = {
  fallbackPlan,
  ruleBasedPlan,
  validateProcessingPlan,
  applyBusinessRules,
  resolutionToRendition
};

