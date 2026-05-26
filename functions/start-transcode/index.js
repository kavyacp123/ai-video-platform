const { MediaConvertClient, CreateJobCommand } = require("@aws-sdk/client-mediaconvert");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { updateVideoStatus, appendProcessingEvent } = require("../../shared/dynamoService");
const { resolutionToRendition } = require("../../shared/processingPlan");
const { VIDEO_STATUS } = require("../../shared/constants");

const mediaConvert = new MediaConvertClient({ endpoint: process.env.MEDIACONVERT_ENDPOINT });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
