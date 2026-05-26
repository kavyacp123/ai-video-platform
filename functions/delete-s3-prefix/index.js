const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { appendProcessingEvent } = require("../../shared/dynamoService");

const s3 = new S3Client({});

exports.handler = async (input) => {
  const bucket = input.bucket;
  const prefix = input.prefix;
  if (!bucket || !prefix) throw new Error("bucket and prefix are required");

  let token;
  let deleted = 0;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token
      })
    );

    const objects = (listed.Contents || []).map((item) => ({ Key: item.Key }));
    token = listed.NextContinuationToken;

    for (let i = 0; i < objects.length; i += 1000) {
      const batch = objects.slice(i, i + 1000);
      if (batch.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch } }));
        deleted += batch.length;
      }
    }
  } while (token);

  await appendProcessingEvent(input.videoId, `DELETE_PREFIX_${input.assetType || "ASSET"}`, `${deleted} objects deleted from ${prefix}.`);
  return { ...input, deleted };
};

