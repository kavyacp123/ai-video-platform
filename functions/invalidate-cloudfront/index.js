const { CloudFrontClient, CreateInvalidationCommand } = require("@aws-sdk/client-cloudfront");
const { appendProcessingEvent } = require("../../shared/dynamoService");

const cloudFront = new CloudFrontClient({});

exports.handler = async (input) => {
  if (!process.env.CLOUDFRONT_DISTRIBUTION_ID) {
    await appendProcessingEvent(input.videoId, "CLOUDFRONT_INVALIDATION_SKIPPED", "Distribution id not configured.");
    return input;
  }

  await cloudFront.send(
    new CreateInvalidationCommand({
      DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `${input.videoId}-${Date.now()}`,
        Paths: {
          Quantity: 4,
          Items: [`/hls/${input.videoId}/*`, `/custom-hls/${input.videoId}/*`, `/thumbnails/${input.videoId}/*`, `/${input.videoId}/*`]
        }
      }
    })
  );

  await appendProcessingEvent(input.videoId, "CLOUDFRONT_INVALIDATED", "CloudFront invalidation requested.");
  return input;
};

