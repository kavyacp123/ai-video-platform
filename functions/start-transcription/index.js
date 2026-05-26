const { TranscribeClient, StartTranscriptionJobCommand } = require("@aws-sdk/client-transcribe");
const { appendProcessingEvent } = require("../../shared/dynamoService");

const transcribe = new TranscribeClient({});

exports.handler = async (input) => {
  if (!input.plan.generateSubtitles) return { ...input, subtitleSkipped: true };

  const transcriptionJobName = `video-${input.videoId}-${Date.now()}`;
  await transcribe.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: transcriptionJobName,
      LanguageCode: "en-US",
      Media: { MediaFileUri: `s3://${input.rawBucket || process.env.RAW_BUCKET_NAME}/${input.s3Key}` },
      OutputBucketName: process.env.SUBTITLE_BUCKET_NAME,
      OutputKey: `${input.videoId}/en/raw-transcript.json`,
      Subtitles: { Formats: ["vtt"], OutputStartIndex: 0 }
    })
  );

  await appendProcessingEvent(input.videoId, "START_TRANSCRIPTION", `Transcribe job ${transcriptionJobName} started.`);
  return { ...input, transcriptionJobName };
};

