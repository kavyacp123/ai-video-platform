const test = require("node:test");
const assert = require("node:assert/strict");

// Mock JWT token verification
function extractUserId(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth) return null;

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  // Mock: extract from token payload (in real app, JWT verify)
  try {
    const payload = Buffer.from(parts[1].split(".")[1], "base64").toString();
    const decoded = JSON.parse(payload);
    return decoded.sub || decoded.user_id || null;
  } catch {
    return null;
  }
}

function createMockToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64");
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: Date.now() / 1000 })).toString("base64");
  const signature = "mock_signature";
  return `${header}.${payload}.${signature}`;
}

// Authorization logic
function canAccessVideo(userId, videoOwnerId) {
  if (!userId) return false;
  return userId === videoOwnerId;
}

// Error response formatting
function errorResponse(statusCode, message, details = {}) {
  return {
    statusCode,
    body: JSON.stringify({
      error: message,
      ...details
    })
  };
}

test("Extracts userId from valid Authorization header", () => {
  const token = createMockToken("user-123");
  const event = {
    headers: { authorization: `Bearer ${token}` }
  };

  const userId = extractUserId(event);
  assert.equal(userId, "user-123");
});

test("Returns null for missing Authorization header", () => {
  const event = { headers: {} };
  const userId = extractUserId(event);
  assert.equal(userId, null);
});

test("Returns null for malformed Authorization header", () => {
  const event = { headers: { authorization: "InvalidFormat" } };
  const userId = extractUserId(event);
  assert.equal(userId, null);
});

test("Returns null for Bearer token with only one part", () => {
  const event = { headers: { authorization: "Bearer invalid" } };
  const userId = extractUserId(event);
  assert.equal(userId, null);
});

test("User can access own video", () => {
  assert.equal(canAccessVideo("user-1", "user-1"), true);
});

test("User cannot access other's video", () => {
  assert.equal(canAccessVideo("user-1", "user-2"), false);
});

test("Null userId cannot access video", () => {
  assert.equal(canAccessVideo(null, "user-1"), false);
});

test("Empty userId cannot access video", () => {
  assert.equal(canAccessVideo("", "user-1"), false);
});

test("Returns 403 Forbidden with proper format", () => {
  const response = errorResponse(403, "Forbidden", { reason: "Unauthorized access" });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.error, "Forbidden");
  assert.equal(body.reason, "Unauthorized access");
});

test("Returns 404 Not Found with proper format", () => {
  const response = errorResponse(404, "Video not found");

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.error, "Video not found");
});

test("Authorization header is case-insensitive for 'Bearer'", () => {
  const token = createMockToken("user-456");
  const variants = [
    { headers: { authorization: `Bearer ${token}` } },
    { headers: { Authorization: `Bearer ${token}` } }
  ];

  for (const event of variants) {
    const userId = extractUserId(event);
    assert.equal(userId, "user-456");
  }
});
