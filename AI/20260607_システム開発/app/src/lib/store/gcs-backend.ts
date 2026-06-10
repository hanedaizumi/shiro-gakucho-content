/**
 * Google Cloud Storage バックエンド
 * Cloud Run の Workload Identity / メタデータサーバーから
 * アクセストークンを自動取得し、store.json を GCS に読み書きする。
 *
 * 環境変数:
 *   GCS_BUCKET_NAME  … バケット名（未設定ならローカルファイルのみ使用）
 *   GCS_OBJECT_NAME  … オブジェクト名（デフォルト: "data/store.json"）
 */

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const GCS_BASE = "https://storage.googleapis.com";

async function getAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export async function gcsRead(
  bucket: string,
  object: string
): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const encoded = encodeURIComponent(object);
  const url = `${GCS_BASE}/storage/v1/b/${bucket}/o/${encoded}?alt=media`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function gcsWrite(
  bucket: string,
  object: string,
  content: string
): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  const encoded = encodeURIComponent(object);
  const url = `${GCS_BASE}/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encoded}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: content,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getGcsConfig(): { bucket: string; object: string } | null {
  const bucket = process.env.GCS_BUCKET_NAME;
  if (!bucket) return null;
  return {
    bucket,
    object: process.env.GCS_OBJECT_NAME ?? "data/store.json",
  };
}
