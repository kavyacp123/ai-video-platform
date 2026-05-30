const { spawn } = require("child_process");
const { createWriteStream } = require("fs");
const { mkdir, readdir, rm } = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } = require("@aws-sdk/client-sfn");

const s3 = new S3Client({});
const sqs = new SQSClient({});
const sfn = new SFNClient({});
const queueUrl = process.env.TRANSCODE_QUEUE_URL;
let shuttingDown = false;

process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function main() {
  console.log(JSON.stringify({ message: "ffmpeg worker started", queueUrl }));
  while (!shuttingDown) {
    const batch = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 7200
      })
    );

    for (const message of batch.Messages || []) {
      await handleMessage(message);
    }
  }
}

async function handleMessage(message) {
  const job = JSON.parse(message.Body);
  try {
    const output = await processJob(job);
    await sfn.send(new SendTaskSuccessCommand({ taskToken: job.taskToken, output: JSON.stringify(output) }));
    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
  } catch (error) {
    console.error(JSON.stringify({ message: "job failed", videoId: job.videoId, error: error.message }));
    if (job.taskToken) {
      await sfn
        .send(
          new SendTaskFailureCommand({
            taskToken: job.taskToken,
            error: "FFMPEG_WORKER_FAILED",
            cause: error.message
          })
        )
        .catch(() => undefined);
    }
  } finally {
    await rm(`/tmp/${job.videoId}`, { recursive: true, force: true }).catch(() => undefined);
    await rm(`/tmp/${job.videoId}.mp4`, { force: true }).catch(() => undefined);
  }
}

async function processJob(job) {
  const inputPath = `/tmp/${job.videoId}.mp4`;
  const outputRoot = `/tmp/${job.videoId}`;
  await mkdir(outputRoot, { recursive: true });
  await downloadToFile(job.sourceBucket, job.s3Key, inputPath);

  if (job.jobType === "THUMBNAIL") {
    return processThumbnailJob(job, inputPath, outputRoot);
  }

  if (job.jobType === "FRAME_EXTRACTION") {
    return processFrameExtractionJob(job, inputPath, outputRoot);
  }

  if (job.jobType === "CLIP_GENERATION") {
    return processClipGenerationJob(job, inputPath, outputRoot);
  }

  const hlsKeys = {};
  await Promise.all(
    (job.resolutions || ["480p"]).map(async (resolution) => {
      const config = resolutionConfig(resolution);
      const dir = path.join(outputRoot, resolution);
      await mkdir(dir, { recursive: true });
      await runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale=${config.width}:${config.height}`,
        "-c:v",
        "libx264",
        "-crf",
        "23",
        "-preset",
        "fast",
        "-c:a",
        "aac",
        "-b:a",
        config.audioBitrate,
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(dir, "seg%03d.ts"),
        path.join(dir, "index.m3u8")
      ]);
      hlsKeys[resolution] = `${job.videoId}/${resolution}/index.m3u8`;
    })
  );

  if (job.generateHighlights) {
    const dir = path.join(outputRoot, "highlights");
    await mkdir(dir, { recursive: true });
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vf",
      "select='gt(scene,0.4)',setpts=N/FRAME_RATE/TB",
      "-vsync",
      "vfr",
      path.join(dir, "frame%03d.jpg")
    ]);
  }

  await uploadTree(outputRoot, job.outputBucket, job.videoId);
  return { videoId: job.videoId, hlsKeys };
}

async function processThumbnailJob(job, inputPath, outputRoot) {
  const dir = path.join(outputRoot, "thumbnails", job.videoId);
  await mkdir(dir, { recursive: true });
  const output = path.join(dir, "poster.jpg");
  await runFfmpeg(["-y", "-ss", "1", "-i", inputPath, "-frames:v", "1", "-q:v", "2", output]);
  await uploadTree(outputRoot, job.outputBucket, "");
  return {
    videoId: job.videoId,
    thumbnailKey: `thumbnails/${job.videoId}/poster.jpg`,
    thumbnailUrl: `thumbnails/${job.videoId}/poster.jpg`
  };
}

async function processFrameExtractionJob(job, inputPath, outputRoot) {
  const dir = path.join(outputRoot, job.videoId, "frames");
  await mkdir(dir, { recursive: true });
  await runFfmpeg(["-y", "-i", inputPath, "-vf", "fps=1/30", "-q:v", "3", path.join(dir, "frame-%03d.jpg")]);
  await uploadTree(outputRoot, job.outputBucket, "");
  const files = await readdir(dir);
  return {
    videoId: job.videoId,
    userId: job.userId,
    plan: { moderationLevel: job.moderationLevel || "standard" },
    frameS3Keys: files.filter((file) => file.endsWith(".jpg")).map((file) => `${job.videoId}/frames/${file}`)
  };
}

async function processClipGenerationJob(job, inputPath, outputRoot) {
  const dir = path.join(outputRoot, "clips", job.videoId);
  await mkdir(dir, { recursive: true });
  const output = path.join(dir, "highlight-1.mp4");
  await runFfmpeg(["-y", "-i", inputPath, "-ss", "0", "-t", "15", "-c:v", "libx264", "-c:a", "aac", output]);
  await uploadTree(outputRoot, job.outputBucket, "");
  return {
    videoId: job.videoId,
    clips: [{ title: "Auto highlight 1", startSeconds: 0, endSeconds: 15, s3Key: `clips/${job.videoId}/highlight-1.mp4` }]
  };
}

async function downloadToFile(bucket, key, filePath) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(result.Body, createWriteStream(filePath));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function uploadTree(root, bucket, prefix) {
  const files = await walk(root);
  await Promise.all(
    files.map(async (file) => {
      const relative = path.relative(root, file);
      const key = prefix ? `${prefix}/${relative}` : relative;
      const body = require("fs").createReadStream(file);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType(file)
        })
      );
    })
  );
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : full;
    })
  );
  return files.flat();
}

function resolutionConfig(resolution) {
  return {
    "720p": { width: 1280, height: 720, audioBitrate: "192k" },
    "480p": { width: 854, height: 480, audioBitrate: "128k" },
    "360p": { width: 640, height: 360, audioBitrate: "96k" }
  }[resolution] || { width: 854, height: 480, audioBitrate: "128k" };
}

function contentType(file) {
  if (file.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (file.endsWith(".ts")) return "video/mp2t";
  if (file.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
