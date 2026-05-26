const { EVENT_TYPES } = require("./constants");

function parseEventBridge(event, expectedType) {
  if (!event.detail) {
    throw Object.assign(new Error("Missing EventBridge detail"), { statusCode: 400 });
  }

  if (expectedType && event["detail-type"] !== expectedType) {
    throw Object.assign(new Error(`Expected ${expectedType}, received ${event["detail-type"]}`), {
      statusCode: 400
    });
  }

  return event.detail;
}

function requireFields(detail, fields) {
  const missing = fields.filter((field) => detail[field] === undefined || detail[field] === null);
  if (missing.length > 0) {
    throw Object.assign(new Error(`Missing required fields: ${missing.join(", ")}`), { statusCode: 400 });
  }
}

function isKnownEventType(eventType) {
  return Object.values(EVENT_TYPES).includes(eventType);
}

module.exports = {
  parseEventBridge,
  requireFields,
  isKnownEventType
};

