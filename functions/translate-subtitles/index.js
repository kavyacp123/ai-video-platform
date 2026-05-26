const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { TranslateClient, TranslateTextCommand } = require("@aws-sdk/client-translate");
const { publish } = require("../../shared/eventPublisher");
const { appendProcessingEvent, updateVideoStatus } = require("../../shared/dynamoService");
const { EVENT_TYPES } = require("../../shared/constants");

const s3 = new S3Client({});
const translate = new TranslateClient({});

exports.handler = async (input) => {
  if (input.subtitleSkipped) return input;
  const languages = input.plan.subtitleLanguages || ["en"];
  const subtitles = {};

  for (const lang of languages) {
    const targetKey = `${input.videoId}/${lang}/subtitles.vtt`;
    if (lang === "en") {
      subtitles.en = `s3://${process.env.SUBTITLE_BUCKET_NAME}/${input.sourceVttS3Key}`;
      await publish(EVENT_TYPES.SUBTITLE_READY, { videoId: input.videoId, userId: input.userId, language: "en", vttS3Key: input.sourceVttS3Key });
      continue;
    }

    const source = await readS3Text(process.env.SUBTITLE_BUCKET_NAME, input.sourceVttS3Key);
    const translated = await translateVtt(source, lang);
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.SUBTITLE_BUCKET_NAME,
        Key: targetKey,
        Body: translated,
        ContentType: "text/vtt"
      })
    );
    subtitles[lang] = `s3://${process.env.SUBTITLE_BUCKET_NAME}/${targetKey}`;
    await publish(EVENT_TYPES.SUBTITLE_READY, { videoId: input.videoId, userId: input.userId, language: lang, vttS3Key: targetKey });
  }

  await updateVideoStatus(input.videoId, input.video?.status || "PROCESSING", { subtitles });
  await appendProcessingEvent(input.videoId, "TRANSLATE_SUBTITLES", "Subtitle outputs saved.");
  return { ...input, subtitles };
};

async function readS3Text(bucket, key) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return result.Body.transformToString();
}

async function translateVtt(vtt, targetLanguageCode) {
  const lines = vtt.split("\n");
  const translated = [];
  for (const line of lines) {
    if (!line.trim() || line.includes("-->") || line.trim() === "WEBVTT" || /^\d+$/.test(line.trim())) {
      translated.push(line);
      continue;
    }
    const result = await translate.send(
      new TranslateTextCommand({
        Text: line,
        SourceLanguageCode: "en",
        TargetLanguageCode: targetLanguageCode
      })
    );
    translated.push(result.TranslatedText || line);
  }
  return translated.join("\n");
}

