const fs = require("fs");
const path = require("path");

jest.setTimeout(600000);

const API_URL = process.env.TEST_API_URL;
const JWT = process.env.TEST_JWT;
const CLOUDFRONT_DOMAIN = process.env.TEST_CLOUDFRONT_DOMAIN;
const TEST_VIDEO = process.env.TEST_VIDEO || path.join(__dirname, "fixtures", "sample-10s.mp4");

describe("full video pipeline", () => {
  test("upload to playback to delete", async () => {
    if (!API_URL || !JWT || !fs.existsSync(TEST_VIDEO)) {
      console.warn("Skipping integration test. Set TEST_API_URL, TEST_JWT, and TEST_VIDEO.");
      return;
    }

    let videoId;
    try {
      const file = fs.readFileSync(TEST_VIDEO);
      const upload = await api("/upload-url", {
        method: "POST",
        body: JSON.stringify({ fileName: "sample-10s.mp4", contentType: "video/mp4", fileSize: file.length })
      });
      videoId = upload.videoId;

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: file
      });
      expect(uploadResponse.ok).toBe(true);

      const status = await waitForReady(videoId);
      expect(status.status).toBe("READY");

      const stream = await api(`/stream/${videoId}`);
      expect(stream.playbackUrl).toMatch(/^https:\/\//);
      if (CLOUDFRONT_DOMAIN) expect(stream.playbackUrl).toContain(CLOUDFRONT_DOMAIN);

      const manifest = await fetch(stream.playbackUrl);
      expect(manifest.status).toBe(200);
      const body = await manifest.text();
      expect(body).toContain("#EXTM3U");
      expect(body).toContain("#EXT-X-STREAM-INF");

      const deleted = await api(`/video/${videoId}`, { method: "DELETE" });
      expect([200, 202, true]).toContain(deleted.deleted || deleted.accepted || 202);
    } catch (error) {
      console.error("Integration failure videoId:", videoId);
      throw error;
    }
  });
});

async function waitForReady(videoId) {
  for (let i = 0; i < 120; i++) {
    const status = await api(`/status/${videoId}`);
    if (status.status === "READY") return status;
    if (status.status === "FAILED") throw new Error(`Video failed: ${JSON.stringify(status)}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Timed out waiting for ${videoId}`);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  return response.json();
}

