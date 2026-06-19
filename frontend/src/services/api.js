import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

async function getAuthHeaders() {
  try {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  } catch (error) {
    console.warn("Auth bypass: Proceeding without Authorization header");
    return {};
  }
}

export const api = {
  async getUploadUrl(fileName, contentType, fileSize) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/upload-url`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, contentType, fileSize })
    }).then((r) => r.json());
  },

  async getVideo(id) {
    return fetch(`${API_URL}/video/${id}`, { headers: await getAuthHeaders() }).then((r) => r.json());
  },

  async getStream(id) {
    return fetch(`${API_URL}/stream/${id}`, { headers: await getAuthHeaders() }).then((r) => r.json());
  },

  async listVideos(lastKey) {
    return fetch(`${API_URL}/videos${lastKey ? `?lastKey=${lastKey}` : ""}`, {
      headers: await getAuthHeaders()
    }).then((r) => r.json());
  },

  async deleteVideo(id) {
    return fetch(`${API_URL}/video/${id}`, {
      method: "DELETE",
      headers: await getAuthHeaders()
    }).then((r) => r.json());
  },

  uploadToS3(presignedUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
      xhr.onerror = reject;
      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    });
  }
};

