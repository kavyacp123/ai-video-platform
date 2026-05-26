const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { publish } = require("../../shared/eventPublisher");
const { EVENT_TYPES, VIDEO_STATUS } = require("../../shared/constants");
const { buildMasterManifest } = require("../../shared/customTranscoder");

const s3 = new S3Client({});

exports.handler = async (input) => {
  const videoId = input.videoId;
  const outputPrefix = input.customTranscode?.outputPrefix || `custom-hls/${videoId}`;
  const renditions =
    input.customTranscode?.jobs ||
    (input.plan?.outputResolutions || ["720p", "480p", "360p"]).map((resolution) => ({ resolution }));

  const body = buildMasterManifest(renditions);
  const masterKey = `${outputPrefix}/master.m3u8`;
  const playbackUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${masterKey}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET_NAME,
      Key: masterKey,
      Body: body,
      ContentType: "application/vnd.apple.mpegurl"
    })
  );

  await updateVideoStatus(videoId, VIDEO_STATUS.READY, {
    hlsS3Key: masterKey,
    playbackUrl,
    customTranscode: {
      ...(input.customTranscode || {}),
      masterManifest: masterKey
    }
  });
  await appendProcessingEvent(videoId, "CUSTOM_MASTER_PLAYLIST_READY", "Custom FFmpeg master playlist assembled.");
  await publish(EVENT_TYPES.VIDEO_READY, { videoId, userId: input.userId, playbackUrl });

  return {
    ...input,
    hlsS3Key: masterKey,
    playbackUrl
  };
};

