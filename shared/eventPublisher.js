const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");
const { EVENT_BUS_NAME, EVENT_SOURCE } = require("./constants");

const eventBridge = new EventBridgeClient({});

async function publish(eventType, detail) {
  const entry = {
    EventBusName: EVENT_BUS_NAME,
    Source: EVENT_SOURCE,
    DetailType: eventType,
    Detail: JSON.stringify({
      eventVersion: "v1",
      eventId: detail.eventId || `${eventType}-${detail.videoId || "global"}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...detail
    })
  };

  const result = await eventBridge.send(new PutEventsCommand({ Entries: [entry] }));
  const failed = result.FailedEntryCount || 0;

  if (failed > 0) {
    throw new Error(`EventBridge publish failed for ${eventType}`);
  }

  return result.Entries?.[0];
}

module.exports = {
  publish
};

