const test = require("node:test");
const assert = require("node:assert/strict");

// Mock implementations for testing video creation and validation
function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function validateUploadInput(body, maxFileSize = 50 * 1024 * 1024 * 1024) {
  const errors = [];

  if (!body.fileName || body.fileName.trim().length === 0) {
    errors.push("fileName is required");
  }
  if (body.fileName && body.fileName.length > 255) {
    errors.push("fileName cannot exceed 255 characters");
  }

  const contentType = body.contentType || "video/mp4";
  const validTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
  if (!validTypes.includes(contentType)) {
    errors.push(`Invalid contentType. Allowed: ${validTypes.join(", ")}`);
  }

  if (body.fileSize > maxFileSize) {
    errors.push(`fileSize exceeds maximum of ${maxFileSize} bytes`);
  }
  if (body.fileSize < 0) {
    errors.push("fileSize cannot be negative");
  }

  const title = body.title || body.fileName || "Untitled";
  if (title.length > 200) {
    errors.push("title cannot exceed 200 characters");
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      fileName: sanitizeFileName(body.fileName || "video.mp4"),
      title: title.substring(0, 200),
      contentType,
      fileSize: Math.max(0, body.fileSize || 0)
    }
  };
}

test("Rejects empty fileName", () => {
  const result = validateUploadInput({ fileName: "", fileSize: 1000 });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("fileName")));
});

test("Accepts valid MP4 upload", () => {
  const result = validateUploadInput({
    fileName: "my-video.mp4",
    contentType: "video/mp4",
    fileSize: 100 * 1024 * 1024,
    title: "My Video"
  });

  assert.equal(result.valid, true);
  assert.equal(result.sanitized.fileName, "my-video.mp4");
});

test("Rejects fileName exceeding 255 characters", () => {
  const longName = "a".repeat(256);
  const result = validateUploadInput({ fileName: longName, fileSize: 1000 });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("255")));
});

test("Rejects invalid contentType", () => {
  const result = validateUploadInput({
    fileName: "video.mp4",
    contentType: "text/html",
    fileSize: 1000
  });

  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("contentType")));
});

test("Rejects file exceeding 50GB", () => {
  const tooLarge = 51 * 1024 * 1024 * 1024;
  const result = validateUploadInput({ fileName: "huge.mp4", fileSize: tooLarge });

  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("exceeds maximum")));
});

test("Rejects negative fileSize", () => {
  const result = validateUploadInput({ fileName: "video.mp4", fileSize: -100 });
  assert.equal(result.valid, false);
  assert(result.errors.some((e) => e.includes("negative")));
});

test("Sanitizes special characters in fileName", () => {
  const result = validateUploadInput({
    fileName: "my@video#file$%.mp4",
    fileSize: 1000
  });

  assert.equal(result.valid, true);
  assert.equal(result.sanitized.fileName, "my_video_file___.mp4");
});

test("Truncates title to 200 characters", () => {
  const longTitle = "a".repeat(250);
  const result = validateUploadInput({
    fileName: "video.mp4",
    title: longTitle,
    fileSize: 1000
  });

  assert.equal(result.valid, true);
  assert.equal(result.sanitized.title.length, 200);
});

test("Uses fileName as fallback title", () => {
  const result = validateUploadInput({
    fileName: "my-awesome-video.mp4",
    fileSize: 1000
  });

  assert.equal(result.sanitized.title, "my-awesome-video.mp4");
});

test("Accepts MOV, AVI, MKV formats", () => {
  const formats = [
    { contentType: "video/quicktime", ext: "mov" },
    { contentType: "video/x-msvideo", ext: "avi" },
    { contentType: "video/x-matroska", ext: "mkv" }
  ];

  for (const fmt of formats) {
    const result = validateUploadInput({
      fileName: `video.${fmt.ext}`,
      contentType: fmt.contentType,
      fileSize: 1000
    });
    assert.equal(result.valid, true, `Failed for ${fmt.ext}`);
  }
});
