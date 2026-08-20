import { readFile } from "node:fs/promises";

const API = "https://open.tiktokapis.com";

export async function uploadTikTokDraft(videoPath: string) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN is not configured");
  const bytes = await readFile(videoPath);
  const init = await fetch(`${API}/v2/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 } }),
  });
  if (!init.ok) throw new Error(`TikTok initialization failed (${init.status}): ${await init.text()}`);
  const payload = await init.json() as { data?: { publish_id?: string; upload_url?: string }; error?: { message?: string } };
  if (!payload.data?.upload_url || !payload.data.publish_id) throw new Error(payload.error?.message || "TikTok did not return an upload URL");
  const uploaded = await fetch(payload.data.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length), "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: bytes });
  if (!uploaded.ok) throw new Error(`TikTok upload failed (${uploaded.status}): ${await uploaded.text()}`);
  return payload.data.publish_id;
}
