const test = require("node:test");
const assert = require("node:assert/strict");

// Mock implementations for testing quota logic
const LIMITS = { free: 5, pro: 100, enterprise: 999999999 };

function nextUtcMidnightMs() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

async function simulateReserveQuota(userId, userPlan, currentCount, currentResetAt) {
  const limit = LIMITS[userPlan] ?? LIMITS.free;
  const now = Date.now();
  const resetAt = nextUtcMidnightMs();

  // If previous reset was in past, reset counter
  const newCount = currentResetAt < now ? 0 : currentCount;

  if (newCount >= limit) {
    const error = new Error("Upload limit reached");
    error.statusCode = 429;
    error.body = { error: "Upload limit reached", limit, plan: userPlan };
    throw error;
  }

  return {
    uploadCountToday: newCount + 1,
    uploadCountResetAt: resetAt
  };
}

test("Free user can upload 5 videos per day", async () => {
  const resetAt = nextUtcMidnightMs();
  let count = 0;

  for (let i = 0; i < 5; i++) {
    const result = await simulateReserveQuota("user-1", "free", count, resetAt);
    count = result.uploadCountToday;
  }

  assert.equal(count, 5);
});

test("Free user blocked at 6th video", async () => {
  const resetAt = nextUtcMidnightMs();

  try {
    await simulateReserveQuota("user-1", "free", 5, resetAt);
    assert.fail("Should have thrown error");
  } catch (error) {
    assert.equal(error.statusCode, 429);
    assert.equal(error.body.limit, 5);
  }
});

test("Pro user can upload 100 videos per day", async () => {
  const resetAt = nextUtcMidnightMs();
  let count = 99;

  const result = await simulateReserveQuota("user-pro", "pro", count, resetAt);
  assert.equal(result.uploadCountToday, 100);
});

test("Pro user blocked at 101st video", async () => {
  const resetAt = nextUtcMidnightMs();

  try {
    await simulateReserveQuota("user-pro", "pro", 100, resetAt);
    assert.fail("Should have thrown error");
  } catch (error) {
    assert.equal(error.statusCode, 429);
    assert.equal(error.body.limit, 100);
  }
});

test("Quota resets after midnight UTC", async () => {
  const pastResetAt = Date.now() - 86400000; // Yesterday
  const result = await simulateReserveQuota("user-1", "free", 5, pastResetAt);

  // Counter resets to 0, then increments to 1
  assert.equal(result.uploadCountToday, 1);
});

test("Enterprise has unlimited uploads", async () => {
  const resetAt = nextUtcMidnightMs();

  for (let i = 0; i < 500; i++) {
    await simulateReserveQuota("user-enterprise", "enterprise", i, resetAt);
  }

  // Should not throw
  assert.ok(true);
});

test("Unknown user plan defaults to free limit", async () => {
  const resetAt = nextUtcMidnightMs();

  try {
    await simulateReserveQuota("user-unknown", "invalid-plan", 5, resetAt);
    assert.fail("Should have thrown error");
  } catch (error) {
    assert.equal(error.body.limit, 5);
  }
});
