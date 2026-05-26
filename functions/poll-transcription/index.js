const { TranscribeClient, GetTranscriptionJobCommand } = require("@aws-sdk/client-transcribe");

const transcribe = new TranscribeClient({});

exports.handler = async (input) => {
  if (input.subtitleSkipped) return input;
  const result = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: input.transcriptionJobName }));
  const status = result.TranscriptionJob?.TranscriptionJobStatus;

  if (status === "FAILED") {
    throw new Error(result.TranscriptionJob?.FailureReason || "Transcription failed");
  }

  return {
    ...input,
    transcriptionStatus: status,
    sourceVttS3Key: `${input.videoId}/en/raw-transcript.vtt`
  };
};

