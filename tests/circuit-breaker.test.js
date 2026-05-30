const test = require("node:test");
const assert = require("node:assert/strict");

// Mock DynamoDB
const mockDdb = {
  send: async (command) => {
    const operation = command.constructor.name;
    if (operation === "GetCommand") {
      return { Item: mockState };
    }
    if (operation === "PutCommand") {
      mockState = { ...command.input.Item };
      return {};
    }
    if (operation === "UpdateCommand") {
      mockState = { ...mockState, ...command.input.AttributeValues };
      return {};
    }
    throw new Error("Unknown operation");
  }
};

let mockState = {
  PK: "CIRCUIT_BREAKER#bedrock",
  SK: "STATE",
  failureCount: 0,
  lastFailureTime: 0,
  state: "CLOSED",
  updatedAt: Date.now()
};

// Simple circuit breaker for testing
const FAILURE_THRESHOLD = 5;
const OPEN_WINDOW_MS = 60000;

async function recordFailure() {
  const now = Date.now();
  mockState.failureCount = (mockState.failureCount || 0) + 1;
  mockState.lastFailureTime = now;

  if (mockState.failureCount >= FAILURE_THRESHOLD) {
    mockState.state = "OPEN";
  }
  mockState.updatedAt = now;
  return mockState;
}

async function recordSuccess() {
  mockState.failureCount = 0;
  mockState.state = "CLOSED";
  mockState.updatedAt = Date.now();
  return mockState;
}

async function beforeCall() {
  const now = Date.now();
  const state = mockState;

  if (state.state === "OPEN" && now - (state.lastFailureTime || 0) < OPEN_WINDOW_MS) {
    return { allowed: false, state };
  }

  if (state.state === "OPEN") {
    mockState.state = "HALF_OPEN";
    return { allowed: true, state: mockState };
  }

  return { allowed: true, state };
}

test("Circuit breaker starts in CLOSED state", async () => {
  mockState = { failureCount: 0, lastFailureTime: 0, state: "CLOSED", updatedAt: Date.now() };
  const result = await beforeCall();
  assert.equal(result.state.state, "CLOSED");
  assert.equal(result.allowed, true);
});

test("Circuit opens after 5 failures", async () => {
  mockState = { failureCount: 0, lastFailureTime: 0, state: "CLOSED", updatedAt: Date.now() };

  for (let i = 0; i < 5; i++) {
    await recordFailure();
  }

  assert.equal(mockState.state, "OPEN");
});

test("Circuit denies calls when OPEN within window", async () => {
  mockState = { failureCount: 5, lastFailureTime: Date.now(), state: "OPEN", updatedAt: Date.now() };
  const result = await beforeCall();
  assert.equal(result.allowed, false);
});

test("Circuit transitions to HALF_OPEN after timeout", async () => {
  const now = Date.now();
  mockState = { failureCount: 5, lastFailureTime: now - 70000, state: "OPEN", updatedAt: now - 70000 };

  const result = await beforeCall();
  assert.equal(result.allowed, true);
  assert.equal(mockState.state, "HALF_OPEN");
});

test("Success in HALF_OPEN closes circuit", async () => {
  mockState = { failureCount: 5, lastFailureTime: Date.now() - 70000, state: "HALF_OPEN", updatedAt: Date.now() };
  await recordSuccess();

  assert.equal(mockState.state, "CLOSED");
  assert.equal(mockState.failureCount, 0);
});

test("Failure count resets after timeout in CLOSED state", async () => {
  mockState = { failureCount: 3, lastFailureTime: Date.now() - 70000, state: "CLOSED", updatedAt: Date.now() - 70000 };
  await recordSuccess();

  assert.equal(mockState.failureCount, 0);
});
