const test = require("node:test");
const assert = require("node:assert/strict");
const { fallbackMetadata, parseMetadataText, validateMetadata } = require("../shared/metadataAgent");

test("fallback metadata derives a useful title from the S3 key", () => {
  const metadata = fallbackMetadata({ s3Key: "uploads/user-1/video-1/aws-system-design-demo.mp4" });

  assert.equal(metadata.title, "Aws System Design Demo");
  assert.equal(metadata.category, "Education");
  assert.deepEqual(metadata.tags.slice(0, 3), ["aws", "system", "design"]);
});

test("parseMetadataText strips markdown and validates shape", () => {
  const metadata = parseMetadataText(
    "```json\n{\"title\":\"Kafka Architecture\",\"description\":\"A backend systems video\",\"tags\":[\"Kafka\",\"System Design\"],\"category\":\"Education\"}\n```"
  );

  assert.equal(metadata.title, "Kafka Architecture");
  assert.deepEqual(metadata.tags, ["kafka", "system design"]);
  assert.equal(metadata.category, "Education");
});

test("validateMetadata falls back for invalid fields", () => {
  const metadata = validateMetadata({ title: "", tags: ["AI!", null], category: "" }, { videoId: "v1" });

  assert.equal(metadata.title, "V1");
  assert.deepEqual(metadata.tags, ["ai"]);
  assert.equal(metadata.category, "General");
});
