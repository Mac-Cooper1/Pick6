/**
 * fal.ai (pay per use, no monthly fee): the AI models behind the
 * commissioner's video message. One function: submit a job to fal's queue,
 * wait for it, return its JSON result.
 *
 * Retention is set per job (X-Fal-Object-Lifecycle-Preference): the
 * finished video is kept for good (it's the only copy), everything in
 * between (the photo placed in a setting, the voice track) expires after a
 * day. Every output URL is public but unguessable.
 */

import { errorMessage } from '../utils/errors';

const FAL_QUEUE_URL = 'https://queue.fal.run';
const POLL_EVERY_MS = 4000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface FalOptions {
  keepForever?: boolean; // the finished video; otherwise outputs expire in a day
  timeoutMs?: number; // how long to wait for the job (default 15 minutes)
}

// What the video pipeline calls: the real fal in production, a stub in the smoke test
export type RunModel = (modelId: string, input: Record<string, unknown>, options?: FalOptions) => Promise<unknown>;

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function falFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`fal returned non-JSON: ${text.slice(0, 120)}`);
  }
}

export const runFal: RunModel = async (modelId, input, options = {}) => {
  if (!isFalConfigured()) throw new Error('FAL_KEY is not set');

  const lifecycle = { expiration_duration_seconds: options.keepForever ? null : 24 * 3600 };
  const submitted = (await falFetch(`${FAL_QUEUE_URL}/${modelId}`, {
    method: 'POST',
    headers: { 'X-Fal-Object-Lifecycle-Preference': JSON.stringify(lifecycle) },
    body: JSON.stringify(input),
  })) as { status_url?: string; response_url?: string };
  // Use the URLs fal hands back: for nested model ids they differ from the submit path
  const { status_url: statusUrl, response_url: responseUrl } = submitted;
  if (!statusUrl || !responseUrl) throw new Error(`fal ${modelId}: no request URLs in ${JSON.stringify(submitted).slice(0, 200)}`);

  const deadline = Date.now() + (options.timeoutMs ?? 15 * 60 * 1000);
  for (;;) {
    await sleep(POLL_EVERY_MS);
    let status: string | undefined;
    try {
      status = ((await falFetch(statusUrl)) as { status?: string }).status;
    } catch (error) {
      // A blip on a status check isn't a failed job; keep waiting
      console.warn(`[fal] ${modelId} status check failed: ${errorMessage(error)}`);
    }
    if (status === 'COMPLETED') break;
    if (Date.now() > deadline) throw new Error(`fal ${modelId} timed out`);
  }
  // A failed job is COMPLETED too; its result call returns the error
  return falFetch(responseUrl);
};

// "Set to a large value for effectively unlimited storage" (fal's client docs)
const KEEP_FOREVER_SECONDS = 31_536_000_000;

/**
 * Put a file of our own on fal's CDN and get its public URL: the finished
 * video once the Pick 6 logo is stamped on. Two steps, the way fal's own
 * client does it: ask for an upload URL, then PUT the bytes there. Uploads
 * take a different retention header than jobs do (no "-Preference").
 */
export async function uploadToFal(
  bytes: Buffer,
  contentType: string,
  fileName: string,
  expireSeconds: number = KEEP_FOREVER_SECONDS
): Promise<string> {
  if (!isFalConfigured()) throw new Error('FAL_KEY is not set');
  const started = (await falFetch('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST',
    headers: { 'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: expireSeconds }) },
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
  })) as { upload_url?: string; file_url?: string };
  if (!started.upload_url || !started.file_url) {
    throw new Error(`fal upload: no URLs in ${JSON.stringify(started).slice(0, 200)}`);
  }

  const put = await fetch(started.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new Error(`fal upload PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
  return started.file_url;
}
