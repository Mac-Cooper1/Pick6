/**
 * The Pick 6 logo in the bottom-right corner of a finished commissioner
 * video (Oct 10). fal has no tool that places an image at a spot on a
 * video, so this runs ffmpeg here: download the video, overlay
 * assets/video-watermark.png (logo, wordmark and www.pick6cfb.com under
 * them) at 28% of the frame's width, re-encode, and put the result back on
 * fal's CDN.
 *
 * ffmpeg comes from the ffmpeg-static package (Render's image has none),
 * runs on one thread at low priority so a live draft never waits on it, and
 * takes about 11 CPU-seconds for a 38-second 960x960 video on a laptop
 * (peak ~160 MB). The watermark is the app's own mark + wordmark, rendered
 * once from client/src/components/Logo.tsx's geometry in Barlow Condensed.
 * 28% keeps the URL readable when the video plays at phone width.
 */

import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { uploadToFal } from './falClient';

// What the video pipeline calls: the real stamp in production, a stub in the smoke test
// (expireSeconds: only tests set it; real videos are kept for good)
export type BrandVideo = (videoUrl: string, expireSeconds?: number) => Promise<string>;

const WATERMARK = path.resolve(__dirname, '../../assets/video-watermark.png');
const LOGO_WIDTH = 0.28; // of the frame's width
const MARGIN = 0.03;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ENCODE_TIMEOUT_MS = 10 * 60 * 1000;

function ffmpegPath(): string {
  const binary = process.env.FFMPEG_PATH || ffmpegStatic;
  if (!binary) throw new Error('no ffmpeg binary (ffmpeg-static did not install one)');
  return binary;
}

/** Run ffmpeg at low priority; resolves with stderr (where ffmpeg writes everything) */
function ffmpeg(args: string[], { allowFailure = false } = {}): Promise<string> {
  const [command, commandArgs] =
    process.platform === 'win32' ? [ffmpegPath(), args] : ['nice', ['-n', '15', ffmpegPath(), ...args]];
  return new Promise((resolve, reject) => {
    execFile(command, commandArgs, { timeout: ENCODE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error && !allowFailure) reject(new Error(`ffmpeg: ${stderr.trim().split('\n').slice(-2).join(' | ') || error.message}`));
      else resolve(stderr);
    });
  });
}

/** Frame width from ffmpeg's own stream listing ("Video: h264 ..., 960x960, ...") */
async function frameWidth(file: string): Promise<number> {
  // With no output file ffmpeg prints the streams and exits non-zero: expected
  const info = await ffmpeg(['-hide_banner', '-i', file], { allowFailure: true });
  const match = /Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(info);
  if (!match) throw new Error('could not read the video size');
  return parseInt(match[1], 10);
}

/** A finished video's URL in, the same video with the logo on it out (a new fal URL) */
export const stampWatermark: BrandVideo = async (videoUrl, expireSeconds) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pick6-video-'));
  try {
    const source = path.join(dir, 'in.mp4');
    const stamped = path.join(dir, 'out.mp4');

    const download = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!download.ok) throw new Error(`download ${download.status}`);
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length > MAX_VIDEO_BYTES) throw new Error('video too large to stamp');
    await writeFile(source, bytes);

    const width = await frameWidth(source);
    const logoWidth = Math.round((width * LOGO_WIDTH) / 2) * 2; // x264 wants even sizes
    const margin = Math.round(width * MARGIN);
    await ffmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', source,
      '-i', WATERMARK,
      '-filter_complex', `[1:v]scale=${logoWidth}:-1[wm];[0:v][wm]overlay=W-w-${margin}:H-h-${margin}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      '-movflags', '+faststart', // playable before it has fully downloaded
      '-threads', '1',
      stamped,
    ]);

    return await uploadToFal(await readFile(stamped), 'video/mp4', `pick6-video-${Date.now()}.mp4`, expireSeconds);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
