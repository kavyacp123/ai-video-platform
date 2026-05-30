const { MediaConvertClient, CreateJobCommand } = require("@aws-sdk/client-mediaconvert");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { resolutionToRendition } = require("../../shared/processingPlan");
const { VIDEO_STATUS } = require("../../shared/constants");

const mediaConvert = new MediaConvertClient({ endpoint: process.env.MEDIACONVERT_ENDPOINT });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Start MediaConvert transcoding job
 *
 * Called from Step Functions pipeline after AI plan is created.
 * Creates HLS transcoding job for multiple output resolutions.
 * Stores task token for Step Functions callback pattern.
 *
 * @param {Object} input - Step Functions input
 * @param {string} input.videoId - Video ID
 * @param {string} input.userId - User ID (for tracking)
 * @param {string} input.s3Key - Raw video S3 key
 * @param {string} input.rawBucket - S3 bucket with raw video
 * @param {Object} input.plan - Processing plan with outputResolutions
 * @param {string} input.taskToken - Step Functions task token (for callbacks)
 *
 * @returns {Object} {...input, mediaConvertJobId: string}
 *
 * Output:
 * - HLS files stored in s3://{PROCESSED_BUCKET}/hls/{videoId}/
 * - master.m3u8 playlist created
 * - Renditions: 720p, 480p, 360p (based on plan)
 * - Codec: H.264, AAC audio
 * - Segment length: 6 seconds
 *
 * Callback:
 * - Uses waitForTaskToken pattern
 * - mediaconvert-callback Lambda will send success/failure back to Step Functions
 */
exports.handler = async (input) => {
  const renditions = (input.plan.outputResolutions || ["480p"]).map(resolutionToRendition);
  const destination = `s3://${process.env.PROCESSED_BUCKET_NAME}/hls/${input.videoId}/`;

  const job = await mediaConvert.send(
    new CreateJobCommand({
      Role: process.env.MEDIACONVERT_ROLE_ARN,
      UserMetadata: { videoId: input.videoId },
      Settings: buildMediaConvertSettings({
        input: `s3://${input.rawBucket || process.env.RAW_BUCKET_NAME}/${input.s3Key}`,
        destination,
        renditions
      })
    })
  );

  await updateVideoStatus(input.videoId, VIDEO_STATUS.TRANSCODING, {
    mediaConvertJobId: job.Job?.Id,
    hlsS3Key: `hls/${input.videoId}/master.m3u8`
  });
  if (input.taskToken) {
    await ddb.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          PK: `MEDIACONVERT#${job.Job?.Id}`,
          SK: "TASK_TOKEN",
          entityType: "TASK_TOKEN",
          videoId: input.videoId,
          userId: input.userId,
          taskToken: input.taskToken,
          ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
          createdAt: new Date().toISOString()
        }
      })
    );
  }
  await appendProcessingEvent(input.videoId, "START_TRANSCODE", `MediaConvert job ${job.Job?.Id} started.`);
  return { ...input, mediaConvertJobId: job.Job?.Id };
};

function buildMediaConvertSettings({ input, destination, renditions }) {
  return {
    TimecodeConfig: { Source: "ZEROBASED" },
    Inputs: [
      {
        FileInput: input,
        AudioSelectors: { "Audio Selector 1": { DefaultSelection: "DEFAULT" } },
        VideoSelector: {}
      }
    ],
    OutputGroups: [
      {
        Name: "Apple HLS",
        OutputGroupSettings: {
          Type: "HLS_GROUP_SETTINGS",
          HlsGroupSettings: { Destination: destination, SegmentLength: 6, MinSegmentLength: 0 }
        },
        Outputs: renditions.map((rendition) => ({
          NameModifier: rendition.name,
          ContainerSettings: { Container: "M3U8", M3u8Settings: {} },
          VideoDescription: {
            Width: rendition.width,
            Height: rendition.height,
            CodecSettings: {
              Codec: "H_264",
              H264Settings: {
                RateControlMode: "QVBR",
                QvbrSettings: { QvbrQualityLevel: 7 },
                MaxBitrate: rendition.bitrate,
                CodecProfile: "MAIN",
                CodecLevel: "AUTO",
                GopSize: 2,
                GopSizeUnits: "SECONDS"
              }
            }
          },
          AudioDescriptions: [
            {
              AudioSourceName: "Audio Selector 1",
              CodecSettings: {
                Codec: "AAC",
                AacSettings: {
                  Bitrate: rendition.audioBitrate,
                  CodingMode: "CODING_MODE_2_0",
                  SampleRate: 48000
                }
              }
            }
          ]
        }))
      }
    ]
  };
}

exports.buildMediaConvertSettings = buildMediaConvertSettings;
