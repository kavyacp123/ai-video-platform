const test = require("node:test");
const assert = require("node:assert/strict");
const { parseEventBridge, requireFields, isKnownEventType } = require("../shared/eventParser");

test("parses expected EventBridge event type", () => {
  const detail = parseEventBridge({ "detail-type": "VIDEO_UPLOADED", detail: { videoId: "v1" } }, "VIDEO_UPLOADED");
  assert.equal(detail.videoId, "v1");
});

test("requireFields rejects missing fields", () => {
  assert.throws(() => requireFields({ videoId: "v1" }, ["videoId", "userId"]), /userId/);
});

test("known event types validate", () => {
  assert.equal(isKnownEventType("VIDEO_READY"), true);
  assert.equal(isKnownEventType("NOPE"), false);
});

