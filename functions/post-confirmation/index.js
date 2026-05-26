const { createUserProfile } = require("../../shared/dynamoService");

exports.handler = async (event) => {
  const attrs = event.request?.userAttributes || {};
  await createUserProfile({
    userId: attrs.sub,
    email: attrs.email,
    name: attrs.name || attrs.email,
    plan: "free"
  }).catch((error) => {
    if (error.name !== "ConditionalCheckFailedException") {
      throw error;
    }
  });

  return event;
};

