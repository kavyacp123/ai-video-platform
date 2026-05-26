const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { MediaConvertClient, CreateJobCommand } = require("@aws-sdk/client-mediaconvert");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const mediaConvert = new MediaConvertClient({
  endpoint: process.env.MEDIACONVERT_ENDPOINT
});

exports.handler = async (event) => {
  const planEvents = event.detail ? [event.detail] : [];

  for (const detail of planEvents) {
    const { bucket, key, videoId, plan = {} } = detail;

    if (!bucket || !key || !videoId) {
      console.warn("AI_PLAN_CREATED event is missing bucket, key, or videoId", JSON.stringify(detail));
      continue;
    }

    if (plan.generateHls === false) {
      console.info("Processing plan skipped HLS generation", videoId);
      continue;
    }

    const input = `s3://${bucket}/${key}`;
    const outputPath = `s3://${process.env.PROCESSED_BUCKET_NAME}/hls/${videoId}/master`;
    const playbackUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/hls/${videoId}/master.m3u8`;
    const renditions = Array.isArray(plan.renditions) && plan.renditions.length > 0 ? plan.renditions : defaultRenditions();

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.VIDEOS_TABLE_NAME,
        Key: { videoId },
        UpdateExpression:
          "SET #status = :status, rawBucket = :rawBucket, rawKey = :rawKey, playbackUrl = :playbackUrl, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":status": "TRANSCODING",
          ":rawBucket": bucket,
          ":rawKey": key,
          ":playbackUrl": playbackUrl,
          ":updatedAt": new Date().toISOString()
        }
      })
    );

    const job = await mediaConvert.send(
      new CreateJobCommand({
        Role: process.env.MEDIACONVERT_ROLE_ARN,
        Settings: {
          TimecodeConfig: {
            Source: "ZEROBASED"
          },
          Inputs: [
            {
              FileInput: input,
              AudioSelectors: {
                "Audio Selector 1": {
                  DefaultSelection: "DEFAULT"
                }
              },
              VideoSelector: {}
            }
          ],
          OutputGroups: [
            {
              Name: "Apple HLS",
              OutputGroupSettings: {
                Type: "HLS_GROUP_SETTINGS",
                HlsGroupSettings: {
                  Destination: outputPath,
                  SegmentLength: 6,
                  MinSegmentLength: 0
                }
              },
              Outputs: renditions.map((rendition) =>
                makeHlsOutput(rendition.name, rendition.width, rendition.height, rendition.bitrate)
              )
            }
          ]
        },
        UserMetadata: {
          videoId
        }
      })
    );

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.VIDEOS_TABLE_NAME,
        Key: { videoId },
        UpdateExpression: "SET mediaConvertJobId = :jobId, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":jobId": job.Job?.Id,
          ":updatedAt": new Date().toISOString()
        }
      })
    );
  }
};

function makeHlsOutput(nameModifier, width, height, bitrate) {
  return {
    NameModifier: nameModifier,
    ContainerSettings: {
      Container: "M3U8",
      M3u8Settings: {}
    },
    VideoDescription: {
      Width: width,
      Height: height,
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          RateControlMode: "QVBR",
          QvbrSettings: {
            QvbrQualityLevel: 7
          },
          MaxBitrate: bitrate,
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
            Bitrate: 96000,
            CodingMode: "CODING_MODE_2_0",
            SampleRate: 48000
          }
        }
      }
    ]
  };
}

function defaultRenditions() {
  return [
    { name: "720p", width: 1280, height: 720, bitrate: 3000000 },
    { name: "480p", width: 854, height: 480, bitrate: 1500000 },
    { name: "360p", width: 640, height: 360, bitrate: 800000 }
  ];
}
