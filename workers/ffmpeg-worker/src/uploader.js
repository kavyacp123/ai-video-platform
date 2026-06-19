"use strict";

const fs   = require("fs");
const path = require("path");
const { readdir } = require("fs/promises");
const {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

/** Multipart threshold: 50 MB */
const MULTIPART_THRESHOLD = 50 * 1024 * 1024;
/** Part size for multipart: 10 MB */
const PART_SIZE           = 10 * 1024 * 1024;
/** Max retry attempts per upload */
const MAX_RETRIES         = 3;

/**
 * Content-type map.
 */
function contentType(file) {
  if (file.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (file.endsWith(".ts"))   return "video/mp2t";
  if (file.endsWith(".jpg"))  return "image/jpeg";
  if (file.endsWith(".mp4"))  return "video/mp4";
  return "application/octet-stream";
}

/**
 * Recursively walk a directory and return all file paths.
 */
async function walk(dir) {
  let results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(await walk(full));
    else results.push(full);
  }
  return results;
}

/**
 * Upload a single file with automatic retry.
 * Uses multipart for files >= MULTIPART_THRESHOLD.
 */
async function uploadFile(bucket, key, filePath, logger) {
  const stat     = fs.statSync(filePath);
  const fileSize = stat.size;

  const attempt = async (n) => {
    try {
      if (fileSize >= MULTIPART_THRESHOLD) {
        await multipartUpload(bucket, key, filePath, fileSize, logger);
      } else {
        const body = fs.createReadStream(filePath);
        await s3.send(new PutObjectCommand({
          Bucket:      bucket,
          Key:         key,
          Body:        body,
          ContentType: contentType(filePath),
        }));
      }
      logger && logger.info("upload file succeeded", { key, bytes: fileSize });
    } catch (err) {
      if (n < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, n);
        logger && logger.warn("upload retry", { key, attempt: n, delay, error: err.message });
        await new Promise((r) => setTimeout(r, delay));
        return attempt(n + 1);
      }
      throw err;
    }
  };
  await attempt(1);
}

/**
 * Multipart upload implementation.
 */
async function multipartUpload(bucket, key, filePath, fileSize, logger) {
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({
    Bucket:      bucket,
    Key:         key,
    ContentType: contentType(filePath),
  }));

  const parts  = [];
  let   offset = 0;
  let   partNo = 1;

  try {
    while (offset < fileSize) {
      const end    = Math.min(offset + PART_SIZE, fileSize);
      const stream = fs.createReadStream(filePath, { start: offset, end: end - 1 });
      const { ETag } = await s3.send(new UploadPartCommand({
        Bucket:     bucket,
        Key:        key,
        UploadId,
        PartNumber: partNo,
        Body:       stream,
      }));
      parts.push({ PartNumber: partNo, ETag });
      logger && logger.info("multipart part uploaded", { key, part: partNo, bytes: end - offset });
      offset = end;
      partNo++;
    }
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket:          bucket,
      Key:             key,
      UploadId,
      MultipartUpload: { Parts: parts },
    }));
  } catch (err) {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId })).catch(() => {});
    throw err;
  }
}

/**
 * Upload all HLS artifacts (*.m3u8 and *.ts) from outputRoot/<resolution>/ directories.
 * Returns { [resolution]: s3KeyOfPlaylist }
 */
async function uploadHls(outputRoot, processedBucket, videoId, resolutions, logger) {
  const hlsKeys = {};
  for (const resolution of resolutions) {
    const dir = path.join(outputRoot, resolution);
    const files = await walk(dir);
    logger.info("uploading HLS segments", { resolution, fileCount: files.length });
    await Promise.all(files.map(async (file) => {
      const relative = path.relative(outputRoot, file);
      const key      = `${videoId}/${relative}`;
      await uploadFile(processedBucket, key, file, logger);
    }));
    hlsKeys[resolution] = `${videoId}/${resolution}/index.m3u8`;
  }
  return hlsKeys;
}

/**
 * Upload the poster thumbnail.
 * Returns the S3 key of the uploaded thumbnail.
 */
async function uploadThumbnail(outputRoot, thumbnailBucket, videoId, logger) {
  const thumbPath = path.join(outputRoot, "thumbnails", videoId, "poster.jpg");
  if (!fs.existsSync(thumbPath)) throw new Error(`Thumbnail not found at ${thumbPath}`);
  const key = `thumbnails/${videoId}/poster.jpg`;
  await uploadFile(thumbnailBucket, key, thumbPath, logger);
  return key;
}

/**
 * Upload extracted frames.
 * Returns array of S3 keys.
 */
async function uploadFrames(outputRoot, thumbnailBucket, videoId, logger) {
  const framesDir = path.join(outputRoot, "frames");
  const files     = await walk(framesDir);
  const keys      = [];
  await Promise.all(files.map(async (file) => {
    const name = path.basename(file);
    const key  = `${videoId}/frames/${name}`;
    await uploadFile(thumbnailBucket, key, file, logger);
    keys.push(key);
  }));
  return keys.sort(); // deterministic order for AI moderation
}

/**
 * Upload highlight clip.
 * Returns S3 key of the uploaded clip.
 */
async function uploadClip(outputRoot, processedBucket, videoId, logger) {
  const clipPath = path.join(outputRoot, "clips", videoId, "highlight-1.mp4");
  if (!fs.existsSync(clipPath)) throw new Error(`Clip not found at ${clipPath}`);
  const key = `clips/${videoId}/highlight-1.mp4`;
  await uploadFile(processedBucket, key, clipPath, logger);
  return key;
}

module.exports = { uploadHls, uploadThumbnail, uploadFrames, uploadClip };
