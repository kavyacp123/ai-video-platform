const { parseEventBridge } = require("../../shared/eventParser");

exports.handler = async (event) => {
  const detail = parseEventBridge(event);
  console.error(JSON.stringify({ message: "VIDEO_FAILED alert", detail }));
};

