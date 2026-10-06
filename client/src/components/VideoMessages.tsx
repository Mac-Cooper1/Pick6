/**
 * Commissioner video messages (Oct 5 prototype). In Settings the
 * commissioner makes an AI talking video of themselves (photo, setting,
 * voice, script); once it's ready, one tap emails it to the league, and a
 * banner on the league page plays it for everyone. The server makes the
 * video on fal.ai in a few minutes; this file only ever sees the result.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  Megaphone,
  PaperPlaneTilt,
  UploadSimple,
  VideoCamera,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { apiErrorMessage, LeagueVideo, videoApi } from '../services/api';
import { Button } from './Button';
import { ErrorMessage } from './ErrorMessage';

const MIN_SCRIPT_CHARS = 10;
const BANNER_DAYS = 14;

export function useLeagueVideos(leagueId: number) {
  return useQuery({
    queryKey: ['leagueVideos', leagueId],
    queryFn: () => videoApi.list(leagueId),
    // While one of your videos is being made, check on it every 5 seconds
    refetchInterval: (query) =>
      query.state.data?.videos.some((v) => v.mine && v.status === 'PROCESSING') ? 5000 : false,
  });
}

/** Shrink a picked photo to 1024px JPEG in the browser: ~200 KB to upload */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that photo. Try a JPEG or PNG."));
      el.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function firstName(name: string): string {
  return name.split(' ')[0];
}

// ---------- Settings: make one (allowlisted commissioners only) ----------

function MyVideo({ video, onSend, sending }: { video: LeagueVideo; onSend: () => void; sending: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-900">
          {video.settingLabel} · {video.voice}
        </span>
        <span className="text-xs text-gray-500 shrink-0">{formatWhen(video.createdAt)}</span>
      </div>
      {video.status === 'PROCESSING' && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block animate-spin rounded-full border-2 border-green-200 border-t-green-700 h-4 w-4 shrink-0" />
          Making it. Usually 2 to 5 minutes, and you can leave this page.
        </p>
      )}
      {video.status === 'FAILED' && (
        <p className="flex items-start gap-1.5 text-sm text-red-700">
          <WarningCircle size={18} className="shrink-0 mt-px" aria-hidden />
          {video.error ?? 'It failed. Try again.'}
        </p>
      )}
      {video.status === 'READY' && video.videoUrl && (
        <>
          <video src={video.videoUrl} controls playsInline preload="metadata" className="w-full max-h-[60vh] rounded-lg bg-black" />
          <div className="mt-2">
            {video.sentAt ? (
              <p className="flex items-center gap-1.5 text-sm text-green-800">
                <CheckCircle size={18} weight="fill" aria-hidden /> Sent to the league {formatWhen(video.sentAt)}
              </p>
            ) : (
              <Button onClick={onSend} disabled={sending}>
                <PaperPlaneTilt size={18} weight="bold" aria-hidden />
                {sending ? 'Sending...' : 'Send to the league'}
              </Button>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-gray-500 mt-2 line-clamp-2">&ldquo;{video.script}&rdquo;</p>
    </div>
  );
}

export function VideoComposer({ leagueId }: { leagueId: number }) {
  const queryClient = useQueryClient();
  const { data } = useLeagueVideos(leagueId);
  const [photo, setPhoto] = useState<string | null>(null);
  const [setting, setSetting] = useState('press');
  const [voice, setVoice] = useState('Brian');
  const [script, setScript] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['leagueVideos', leagueId] });
  const create = useMutation({
    mutationFn: () => videoApi.create(leagueId, { photo: photo ?? '', setting, voice, script, consent }),
    onSuccess: () => {
      setScript('');
      setError(null);
      setSentNote(null);
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Couldn't start the video")),
  });
  const send = useMutation({
    mutationFn: (videoId: number) => videoApi.send(leagueId, videoId),
    onSuccess: ({ sentTo }) => {
      setSentNote(`Sent to ${sentTo} ${sentTo === 1 ? 'member' : 'members'} by email. It's on the league page too.`);
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Couldn't send it")),
  });

  if (!data?.canCreate) return null;

  const mine = data.videos.filter((v) => v.mine);
  const max = data.maxScriptChars;
  const length = script.trim().length;
  const canMake = Boolean(photo) && consent && length >= MIN_SCRIPT_CHARS && length <= max;

  return (
    <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="label text-amber-700">Commissioner</span>
        <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">Video message</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Make an AI video of yourself reading your own script, then send it to the whole league in one tap.
        It takes a few minutes to make.
      </p>
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <p className="label mb-1.5">Your photo</p>
      <div className="flex items-center gap-3 mb-4">
        {photo ? (
          <img src={photo} alt="Your photo" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400" aria-hidden>
            <UploadSimple size={24} />
          </div>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {photo ? 'Change photo' : 'Choose photo'}
          </Button>
          <p className="text-xs text-gray-500 mt-1">A clear, front-facing photo of just you.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setPhoto(await shrinkPhoto(file));
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't read that photo");
            }
          }}
        />
      </div>

      <p className="label mb-1.5">Setting</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {data.settings.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={setting === s.id}
            onClick={() => setSetting(s.id)}
            className={`px-3 py-2 rounded-full text-sm font-semibold border transition-colors touch-manipulation ${
              setting === s.id
                ? 'bg-green-700 border-green-700 text-white'
                : 'bg-white border-gray-300 text-gray-700 hover:border-green-600 active:bg-gray-100'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label htmlFor="video-voice" className="label mb-1.5 block">
        Voice
      </label>
      <select
        id="video-voice"
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        className="w-full px-3.5 py-3 text-base bg-white border border-gray-300 rounded-lg text-gray-900 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
      >
        {data.voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}: {v.description}
          </option>
        ))}
      </select>

      <label htmlFor="video-script" className="label mb-1.5 block">
        Script
      </label>
      <textarea
        id="video-script"
        rows={4}
        maxLength={max}
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="Week 6 is here. Set your swap lists before Monday, or keep your five and lose with dignity."
        className="w-full px-3.5 py-3 text-base bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
      />
      <p className="text-xs text-gray-500 mt-1 mb-4 text-right tabular-nums">
        {script.length}/{max} · about {Math.max(1, Math.round(length / 15))} seconds
      </p>

      <label className="flex items-start gap-2.5 text-sm text-gray-700 mb-4">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 w-5 h-5 shrink-0 accent-green-700"
        />
        <span>This photo is of me, and I&apos;m OK with it being turned into an AI video the league can watch.</span>
      </label>

      <Button onClick={() => create.mutate()} disabled={!canMake || create.isPending}>
        <VideoCamera size={18} weight="bold" aria-hidden />
        {create.isPending ? 'Starting...' : 'Make my video'}
      </Button>

      {mine.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
          <p className="label">Your videos</p>
          {sentNote && <p className="text-sm text-green-800">{sentNote}</p>}
          {mine.map((v) => (
            <MyVideo
              key={v.id}
              video={v}
              onSend={() => send.mutate(v.id)}
              sending={send.isPending && send.variables === v.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- The league page: banner + player for everyone ----------

const seenKey = (id: number) => `pick6_video_seen_${id}`;

function wasSeen(id: number): boolean {
  try {
    return localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return false;
  }
}

function markSeen(id: number) {
  try {
    localStorage.setItem(seenKey(id), '1');
  } catch {
    // private mode: the banner just shows again next time
  }
}

export function VideoPlayerModal({ video, onClose }: { video: LeagueVideo; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes, and the page behind doesn't scroll (like the team card)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const overflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Video from ${video.maker.name}`}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-green-900 text-white">
          <div className="min-w-0">
            <p className="font-display font-bold uppercase tracking-wide text-lg leading-tight truncate">
              From {video.maker.name}
            </p>
            <p className="text-xs text-white/70">AI-generated video. {firstName(video.maker.name)} wrote the script.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 rounded-lg hover:bg-white/10 active:bg-white/20 touch-manipulation"
          >
            <X size={22} weight="bold" />
          </button>
        </div>
        {video.videoUrl && (
          <video src={video.videoUrl} controls autoPlay playsInline className="w-full max-h-[70vh] bg-black" />
        )}
        <p className="px-4 py-3 text-sm text-gray-600">&ldquo;{video.script}&rdquo;</p>
      </div>
    </div>,
    document.body
  );
}

/**
 * The newest video sent in the last two weeks, until you've watched it (or
 * closed the banner) on this device. The email's link (?video=ID) opens the
 * player straight away.
 */
export function LeagueVideoBanner({ leagueId }: { leagueId: number }) {
  const { data } = useLeagueVideos(leagueId);
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState<LeagueVideo | null>(null);
  const [, setSeenTick] = useState(0);

  const linked = params.get('video');
  useEffect(() => {
    if (!linked || !data) return;
    const video = data.videos.find((v) => String(v.id) === linked && v.videoUrl);
    if (video) setPlaying(video);
    const next = new URLSearchParams(params);
    next.delete('video');
    setParams(next, { replace: true });
  }, [linked, data, params, setParams]);

  const latest = data?.videos.find(
    (v) => v.sentAt && v.videoUrl && Date.now() - new Date(v.sentAt).getTime() < BANNER_DAYS * 24 * 3600 * 1000
  );
  const close = (id: number) => {
    markSeen(id);
    setSeenTick((n) => n + 1);
  };

  return (
    <>
      {latest && !wasSeen(latest.id) && (
        <div className="px-4 sm:px-6 pt-4">
          <div className="card flex items-center gap-3 p-3 sm:p-4 !border-amber-300 !bg-amber-50">
            <Megaphone size={26} weight="fill" className="text-amber-700 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 leading-tight">New video from {latest.maker.name}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                AI-generated message from the commissioner
                {latest.durationSec ? ` · ${Math.round(latest.durationSec)} seconds` : ''}
              </p>
            </div>
            <Button size="sm" onClick={() => setPlaying(latest)}>
              Watch
            </Button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => close(latest.id)}
              className="p-1.5 -mr-1 text-gray-500 hover:text-gray-800 active:text-gray-900 touch-manipulation"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
      )}
      {playing && (
        <VideoPlayerModal
          video={playing}
          onClose={() => {
            close(playing.id);
            setPlaying(null);
          }}
        />
      )}
    </>
  );
}
