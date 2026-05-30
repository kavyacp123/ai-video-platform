function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": process.env.CORS_ORIGIN || "*",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
}

function getUserId(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || event.requestContext?.authorizer || {};
  const userId = claims.sub || claims.userId;
  if (!userId) {
    const error = new Error("Authenticated user id is required");
    error.statusCode = 401;
    throw error;
  }
  return userId;
}

function errorResponse(error, fallbackStatus = 500) {
  const statusCode = error.statusCode || fallbackStatus;
  return json(statusCode, {
    error: error.name || "Error",
    message: error.message || "Unexpected error"
  });
}

module.exports = {
  json,
  parseBody,
  getUserId,
  errorResponse
};
