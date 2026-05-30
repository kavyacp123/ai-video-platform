const { getVideo, updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES } = require("../../shared/constants");
const { fallbackMetadata, generateMetadataWithBedrock } = require("../../shared/metadataAgent");
const logger = require("../../shared/logger");

exports.handler = async (input) => {
  const video = (await getVideo(input.videoId)) || input.video || {};
  const bedrockEnabled = process.env.ENABLE_BEDROCK_METADATA !== "false";
  let metadata;

  if (bedrockEnabled) {
    try {
      metadata = await generateMetadataWithBedrock({
        video: { ...video, videoId: input.videoId, s3Key: input.s3Key, fileSize: input.fileSize },
        plan: input.plan,
        pipelineResults: input.pipelineResults || []
      });
    } catch (error) {
      logger.warn("Metadata Bedrock call failed, using fallback metadata", {
        videoId: input.videoId,
        error: error.message
      });
      metadata = fallbackMetadata({ ...video, videoId: input.videoId, s3Key: input.s3Key });
    }
  } else {
    metadata = fallbackMetadata({ ...video, videoId: input.videoId, s3Key: input.s3Key });
  }

  await updateVideoStatus(input.videoId, video.status || "PROCESSING", {
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
    category: metadata.category,
    aiMetadata: {
      ...metadata,
      generatedAt: new Date().toISOString(),
      modelId: bedrockEnabled ? process.env.BEDROCK_METADATA_MODEL_ID || process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0" : "fallback"
    }
  });
  await appendProcessingEvent(input.videoId, EVENT_TYPES.METADATA_GENERATED, "AI metadata generated.");
  await publish(EVENT_TYPES.METADATA_GENERATED, {
    videoId: input.videoId,
    userId: input.userId,
    metadata
  });

  return { ...input, metadata };
};
