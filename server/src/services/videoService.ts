/**
 * Commissioner video messages (Oct 5 prototype). A commissioner uploads a
 * photo of themselves, picks a setting and a voice and writes a script;
 * fal.ai makes a talking video, and one tap emails it to the league.
 *
 * Three fal jobs (pay per use, about $1.75 for 30 seconds):
 *  1. setting: nano-banana edit puts the person in the scene ("as is" skips it)
 *  2. voice: ElevenLabs reads the script
 *  3. video: Kling AI Avatar v2 animates the photo to the voice
 * Only the finished video's URL is stored; the photo never is.
 *
 * Prototype gates, since every video is paid from Mac's fal credits: FAL_KEY
 * is set, the maker's email is in VIDEO_CREATORS, and they commission the
 * league. Own face only (fal's policy forbids anyone's likeness without
 * consent): the maker ticks a box saying the photo is them.
 */

import { LeagueVideo, LeagueVideoStatus, MemberRole } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { errorMessage } from '../utils/errors';
import { appUrl, renderEmail, sendEmail } from './emailService';
import { isFalConfigured, runFal, RunModel } from './falClient';

export const VIDEO_SETTINGS = [
  { id: 'press', label: 'Press conference', scene: 'at a college football press conference, standing behind a podium covered in microphones, a plain sponsor backdrop behind them, bright camera lighting' },
  { id: 'locker', label: 'Locker room', scene: 'in a college football locker room, lockers with helmets and jerseys behind them, warm overhead lights' },
  { id: 'sideline', label: 'Sideline', scene: 'on a college football sideline at night, wearing a headset and a team polo, stadium lights and a blurred crowd behind them' },
  { id: 'tailgate', label: 'Tailgate', scene: 'at a tailgate in a stadium parking lot on a sunny game day, tents, grills and fans behind them' },
  { id: 'studio', label: 'TV studio', scene: 'behind a sports TV studio desk, a broadcast set with screens and football graphics behind them, studio lighting' },
  { id: 'asis', label: 'My photo as is', scene: null },
] as const;

// ElevenLabs' standard voices (names as fal's voice field takes them)
export const VIDEO_VOICES = [
  { id: 'Brian', label: 'Brian', description: 'Deep and steady' },
  { id: 'Bill', label: 'Bill', description: 'Older, trustworthy' },
  { id: 'Callum', label: 'Callum', description: 'Intense' },
  { id: 'Chris', label: 'Chris', description: 'Laid-back' },
  { id: 'Daniel', label: 'Daniel', description: 'British, authoritative' },
  { id: 'Charlie', label: 'Charlie', description: 'Australian' },
  { id: 'Jessica', label: 'Jessica', description: 'Bright, expressive' },
  { id: 'Matilda', label: 'Matilda', description: 'Warm, friendly' },
] as const;

export const MAX_SCRIPT_CHARS = 600; // about 40 seconds of speech
const MIN_SCRIPT_CHARS = 10;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // the app sends ~200 KB; this is a backstop
export const VIDEOS_PER_DAY = 5;

const MODELS = {
  scene: 'fal-ai/nano-banana/edit',
  voice: 'fal-ai/elevenlabs/tts/multilingual-v2',
  video: 'fal-ai/kling-video/ai-avatar/v2/standard',
};

export interface VideoView {
  id: number;
  maker: { userId: number; name: string };
  mine: boolean;
  setting: string;
  settingLabel: string;
  voice: string;
  script: string;
  status: LeagueVideoStatus;
  error: string | null;
  videoUrl: string | null;
  durationSec: number | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface NewVideo {
  photo: string; // data:image/...;base64,...
  setting: string;
  voice: string;
  script: string;
}

/** Emails allowed to make videos while it's a prototype (Mac pays for each one) */
function creatorEmails(): Set<string> {
  return new Set(
    (process.env.VIDEO_CREATORS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function membership(leagueId: number, userId: number) {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    include: { user: true, league: true },
  });
  if (!member) throw new AppError('You are not a member of this league', 403);
  return member;
}

async function canCreate(leagueId: number, userId: number): Promise<boolean> {
  const member = await membership(leagueId, userId);
  return (
    isFalConfigured() &&
    member.role === MemberRole.COMMISSIONER &&
    creatorEmails().has(member.user.email.toLowerCase())
  );
}

function toView(video: LeagueVideo & { createdBy: { name: string } }, userId: number): VideoView {
  return {
    id: video.id,
    maker: { userId: video.createdById, name: video.createdBy.name },
    mine: video.createdById === userId,
    setting: video.setting,
    settingLabel: VIDEO_SETTINGS.find((s) => s.id === video.setting)?.label ?? video.setting,
    voice: video.voice,
    script: video.script,
    status: video.status,
    error: video.error,
    videoUrl: video.status === LeagueVideoStatus.READY ? video.videoUrl : null,
    durationSec: video.durationSec,
    sentAt: video.sentAt,
    createdAt: video.createdAt,
  };
}

/** Sent videos for everyone, plus the maker's own unsent ones */
export async function listVideos(leagueId: number, userId: number) {
  const allowed = await canCreate(leagueId, userId);
  const videos = await prisma.leagueVideo.findMany({
    where: {
      leagueId,
      OR: [{ sentAt: { not: null }, status: LeagueVideoStatus.READY }, { createdById: userId }],
    },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return {
    canCreate: allowed,
    settings: VIDEO_SETTINGS.map(({ id, label }) => ({ id, label })),
    voices: VIDEO_VOICES,
    maxScriptChars: MAX_SCRIPT_CHARS,
    videos: videos.map((video) => toView(video, userId)),
  };
}

function validate(body: unknown): NewVideo {
  const input = (body ?? {}) as Record<string, unknown>;
  const { photo, setting, voice, script, consent } = input;

  if (consent !== true) {
    throw new AppError('Confirm the photo is of you first', 400);
  }
  if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
    throw new AppError('Add a photo (JPEG, PNG or WebP)', 400);
  }
  if (((photo.length - photo.indexOf(',') - 1) * 3) / 4 > MAX_PHOTO_BYTES) {
    throw new AppError('That photo is too big', 400);
  }
  if (typeof setting !== 'string' || !VIDEO_SETTINGS.some((s) => s.id === setting)) {
    throw new AppError('Pick a setting', 400);
  }
  if (typeof voice !== 'string' || !VIDEO_VOICES.some((v) => v.id === voice)) {
    throw new AppError('Pick a voice', 400);
  }
  const text = typeof script === 'string' ? script.trim().replace(/\s+/g, ' ') : '';
  if (text.length < MIN_SCRIPT_CHARS) {
    throw new AppError('Write a script first', 400);
  }
  if (text.length > MAX_SCRIPT_CHARS) {
    throw new AppError(`Keep the script under ${MAX_SCRIPT_CHARS} characters`, 400);
  }
  return { photo, setting, voice, script: text };
}

/**
 * Start a video. Returns at once with it PROCESSING; the fal jobs run in the
 * background (a few minutes) and the maker's list polls until it's READY.
 */
export async function createVideo(
  leagueId: number,
  userId: number,
  body: unknown,
  { runModel = runFal, start = true }: { runModel?: RunModel; start?: boolean } = {}
): Promise<VideoView> {
  if (!(await canCreate(leagueId, userId))) {
    throw new AppError('Video messages are invite-only while they are a prototype', 403);
  }
  const input = validate(body);

  const madeToday = await prisma.leagueVideo.count({
    where: { createdById: userId, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  if (madeToday >= VIDEOS_PER_DAY) {
    throw new AppError(`That's ${VIDEOS_PER_DAY} videos in a day. Try again tomorrow.`, 429);
  }

  const video = await prisma.leagueVideo.create({
    data: { leagueId, createdById: userId, setting: input.setting, voice: input.voice, script: input.script },
    include: { createdBy: { select: { name: true } } },
  });
  if (start) {
    processVideo(video.id, input, runModel).catch((error) =>
      console.error(`[Video] ${video.id} crashed: ${errorMessage(error)}`)
    );
  }
  return toView(video, userId);
}

/** A string URL at `path` inside a fal result, or an error naming the step */
function urlAt(result: unknown, path: (string | number)[], step: string): string {
  let value: unknown = result;
  for (const key of path) {
    value = value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined;
  }
  if (typeof value !== 'string' || !value.startsWith('http')) {
    throw new Error(`${step}: no URL at ${path.join('.')} in ${JSON.stringify(result).slice(0, 200)}`);
  }
  return value;
}

class StepError extends Error {}

async function step<T>(friendly: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[Video] ${friendly}: ${errorMessage(error)}`);
    throw new StepError(friendly);
  }
}

/** The three fal jobs. Exported for the smoke test (with a stub runModel). */
export async function processVideo(id: number, input: NewVideo, runModel: RunModel = runFal): Promise<void> {
  try {
    let image = input.photo;
    const setting = VIDEO_SETTINGS.find((s) => s.id === input.setting);
    if (setting?.scene) {
      const scene = await step("Couldn't put your photo in that setting. Try another photo or setting.", () =>
        runModel(MODELS.scene, {
          prompt:
            `Place this exact person ${setting.scene}. Keep their face, hair, skin tone and identity exactly ` +
            'as in the photo. Head and shoulders, facing the camera, neutral expression, photorealistic.',
          image_urls: [input.photo],
          num_images: 1,
          output_format: 'jpeg',
        })
      );
      image = await step("Couldn't put your photo in that setting. Try another photo or setting.", async () =>
        urlAt(scene, ['images', 0, 'url'], 'scene')
      );
    }

    const speech = await step("Couldn't make the voice. Try again in a minute.", () =>
      runModel(MODELS.voice, { text: input.script, voice: input.voice })
    );
    const audioUrl = await step("Couldn't make the voice. Try again in a minute.", async () =>
      urlAt(speech, ['audio', 'url'], 'voice')
    );

    const animated = await step(
      "Couldn't animate the photo. A clear, front-facing photo of one face works best.",
      () =>
        runModel(
          MODELS.video,
          {
            image_url: image,
            audio_url: audioUrl,
            prompt: 'The person talks straight to the camera with natural expressions and small head movements.',
          },
          { keepForever: true }
        )
    );
    const videoUrl = await step("Couldn't animate the photo. Try again in a minute.", async () =>
      urlAt(animated, ['video', 'url'], 'video')
    );
    const duration = (animated as { duration?: unknown }).duration;

    await prisma.leagueVideo.updateMany({
      where: { id, status: LeagueVideoStatus.PROCESSING },
      data: {
        status: LeagueVideoStatus.READY,
        videoUrl,
        durationSec: typeof duration === 'number' ? duration : null,
      },
    });
    console.log(`[Video] ${id} ready`);
  } catch (error) {
    await prisma.leagueVideo.updateMany({
      where: { id, status: LeagueVideoStatus.PROCESSING },
      data: {
        status: LeagueVideoStatus.FAILED,
        error: error instanceof StepError ? error.message : 'Something went wrong making the video. Try again.',
      },
    });
    if (!(error instanceof StepError)) console.error(`[Video] ${id} failed: ${errorMessage(error)}`);
  }
}

/**
 * The jobs run in this process, so a restart (a deploy) loses any in
 * flight. Called once at startup: anything still PROCESSING is orphaned.
 */
export async function failInterruptedVideos(): Promise<number> {
  const { count } = await prisma.leagueVideo.updateMany({
    where: { status: LeagueVideoStatus.PROCESSING },
    data: { status: LeagueVideoStatus.FAILED, error: 'Interrupted by an app update while it was being made. Try again.' },
  });
  if (count > 0) console.log(`[Video] Marked ${count} interrupted video(s) failed`);
  return count;
}

/** One tap: email the video to every other member. A video goes out once. */
export async function sendVideo(leagueId: number, videoId: number, userId: number): Promise<{ sentTo: number }> {
  const member = await membership(leagueId, userId);
  if (member.role !== MemberRole.COMMISSIONER) {
    throw new AppError('Only the commissioner can send video messages', 403);
  }
  const video = await prisma.leagueVideo.findFirst({ where: { id: videoId, leagueId, createdById: userId } });
  if (!video) throw new AppError('Video not found', 404);
  if (video.status !== LeagueVideoStatus.READY) throw new AppError('That video is not ready yet', 409);

  const taken = await prisma.leagueVideo.updateMany({
    where: { id: videoId, sentAt: null },
    data: { sentAt: new Date() },
  });
  if (taken.count === 0) throw new AppError('Already sent', 409);

  const members = await prisma.leagueMember.findMany({
    where: { leagueId, userId: { not: userId } },
    include: { user: true },
  });
  const maker = member.user.name;
  const league = member.league.name;
  const seconds = video.durationSec ? ` (${Math.round(video.durationSec)} seconds)` : '';
  const { html, text } = renderEmail({
    preheader: `${maker} made the league a video${seconds}.`,
    heading: 'Video from the commish',
    paragraphs: [
      `${maker} sent ${league} a video message${seconds}.`,
      `It's AI-generated: made from ${maker.split(' ')[0]}'s photo, saying a script they wrote.`,
    ],
    button: { label: 'Watch it', url: appUrl(`/league/${leagueId}?video=${videoId}`) },
    footer: `You're getting this because you play in ${league} on Pick 6.`,
  });

  let sentTo = 0;
  for (const m of members) {
    if (await sendEmail({ to: m.user.email, subject: `${maker} sent ${league} a video`, html, text })) sentTo++;
  }
  console.log(`[Video] ${videoId} sent to ${sentTo}/${members.length} members of league ${leagueId}`);
  return { sentTo };
}
