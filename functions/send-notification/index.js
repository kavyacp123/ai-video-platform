const { PublishCommand } = require("@aws-sdk/client-sns");
const { SNSClient } = require("@aws-sdk/client-sns");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { client } = require("../../shared/dynamoService.js");
const logger = require("../../shared/logger.js");

const snsClient = new SNSClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

exports.handler = async (event) => {
  try {
    const { userId, targetUserId, notificationType, data } = JSON.parse(event.body || "{}");

    if (!userId || !targetUserId || !notificationType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    const notificationId = `NOTIF#${Date.now()}#${Math.random().toString(36).substr(2, 9)}`;

    // Store notification in DynamoDB
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${targetUserId}`,
          SK: `NOTIFICATION#${notificationId}`,
          entityType: "NOTIFICATION",
          notificationId,
          fromUserId: userId,
          notificationType,
          data,
          read: false,
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days
        }
      })
    );

    // Send SNS notification
    if (SNS_TOPIC_ARN) {
      try {
        await snsClient.send(
          new PublishCommand({
            TopicArn: SNS_TOPIC_ARN,
            Message: formatNotificationMessage(notificationType, data, userId),
            Subject: `New ${notificationType} notification`
          })
        );
      } catch (e) {
        logger.warn("Failed to publish SNS notification", { error: e.message });
      }
    }

    logger.info("Notification created", { notificationId, targetUserId, notificationType });

    return {
      statusCode: 201,
      body: JSON.stringify({
        notificationId,
        delivered: true
      })
    };
  } catch (error) {
    logger.error("Error creating notification", { error: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create notification" })
    };
  }
};

function formatNotificationMessage(type, data, userId) {
  switch (type) {
    case "comment_reply":
      return `User ${userId} replied to your comment: ${data.text?.substring(0, 50)}`;
    case "new_follower":
      return `User ${userId} started following you`;
    case "video_like":
      return `User ${userId} liked your video`;
    case "video_featured":
      return `Your video "${data.title || "Untitled"}" was featured`;
    default:
      return `New notification from ${userId}`;
  }
}
