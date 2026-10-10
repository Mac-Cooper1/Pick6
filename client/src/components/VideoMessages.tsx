/**
 * Commissioner video messages (Oct 5; paid since Oct 10). In Settings the
 * commissioner makes an AI talking video of themselves (photo, setting,
 * voice, and a script they write or have AI draft); once it's ready, one
 * tap emails it to the league, and a banner on the league page plays it for
 * everyone. Free for the host's list; everyone else pays per video through
 * Stripe Checkout (off to Stripe and back, the form kept in sessionStorage).
 * The server makes the video on fal.ai in about ten minutes; this file only
 * ever sees the result.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  Megaphone,
  PaperPlaneTilt,
  Sparkle,
  UploadSimple,
  VideoCamera,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { apiErrorMessage, LeagueVideo, NewLeagueVideo, videoApi } from '../services/api';
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
          Making it. This takes about 10 minutes, and you can leave this page.
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

// The form survives the trip to Stripe and back in sessionStorage (this tab
// only, gone when it closes). The server never holds the photo until the
// video is actually being made.
const draftKey = (leagueId: number) => `pick6_video_draft_${leagueId}`;

function saveForm(leagueId: number, form: NewLeagueVideo & { notes: string }) {
  try {
    sessionStorage.setItem(draftKey(leagueId), JSON.stringify(form));
  } catch {
    // storage full or blocked: after paying they fill the form in again
  }
}

function loadForm(leagueId: number): (NewLeagueVideo & { notes: string }) | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(leagueId)) ?? 'null');
    return saved && typeof saved.script === 'string' ? saved : null;
  } catch {
    return null;
  }
}

function clearForm(leagueId: number) {
  try {
    sessionStorage.removeItem(draftKey(leagueId));
  } catch {
    // nothing to clear
  }
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

export function VideoComposer({ leagueId }: { leagueId: number }) {
  const queryClient = useQueryClient();
  const { data } = useLeagueVideos(leagueId);
  const [params, setParams] = useSearchParams();
  const [saved] = useState(() => loadForm(leagueId));
  const [photo, setPhoto] = useState<string | null>(saved?.photo || null);
  const [setting, setSetting] = useState(saved?.setting ?? 'press');
  const [voice, setVoice] = useState(saved?.voice ?? 'Brian');
  const [script, setScript] = useState(saved?.script ?? '');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [consent, setConsent] = useState(saved?.consent ?? false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const handledReturn = useRef<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['leagueVideos', leagueId] });
  const started = () => {
    clearForm(leagueId);
    setScript('');
    setError(null);
    refresh();
  };
  const create = useMutation({
    mutationFn: () => videoApi.create(leagueId, { photo: photo ?? '', setting, voice, script, consent }),
    onSuccess: () => {
      started();
      setNotice('Your video is being made. It takes about 10 minutes.');
    },
    onError: (err) => setError(apiErrorMessage(err, "Couldn't start the video")),
  });
  // Paying: remember the form, then off to Stripe (unless one is already paid for)
  const checkout = useMutation({
    mutationFn: async () => {
      saveForm(leagueId, { photo: photo ?? '', setting, voice, script, consent, notes });
      const { checkoutUrl, hasCredit } = await videoApi.checkout(leagueId);
      if (checkoutUrl) window.location.assign(checkoutUrl);
      else if (hasCredit) create.mutate();
    },
    onError: (err) => setError(apiErrorMessage(err, "Couldn't open checkout")),
  });
  const draft = useMutation({
    mutationFn: () => videoApi.draft(leagueId, { notes, setting }),
    onSuccess: ({ script: drafted }) => {
      setScript(drafted);
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err, "Couldn't write a draft")),
  });
  const send = useMutation({
    mutationFn: (videoId: number) => videoApi.send(leagueId, videoId),
    onSuccess: ({ sentTo }) => {
      setNotice(`Sent to ${sentTo} ${sentTo === 1 ? 'member' : 'members'} by email. It's on the league page too.`);
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Couldn't send it")),
  });

  // Back from Stripe: ?video_paid=<session> (paid, or so the URL says: the
  // server asks Stripe) or ?video_canceled=1. Once per visit.
  const paidSession = params.get('video_paid');
  const canceled = params.get('video_canceled');
  useEffect(() => {
    const token = paidSession ?? (canceled ? 'canceled' : null);
    if (!token || handledReturn.current === token) return;
    handledReturn.current = token;
    const next = new URLSearchParams(params);
    next.delete('video_paid');
    next.delete('video_canceled');
    setParams(next, { replace: true });

    if (!paidSession) {
      setNotice('Checkout canceled. Nothing was charged, and your video is still here.');
      return;
    }
    (async () => {
      try {
        const { paid } = await videoApi.confirmPayment(leagueId, paidSession);
        if (!paid) {
          setError("That payment didn't go through. Nothing was charged.");
          return;
        }
        const form = loadForm(leagueId);
        if (form?.photo && form.consent && form.script.trim().length >= MIN_SCRIPT_CHARS) {
          await videoApi.create(leagueId, form);
          clearForm(leagueId);
          setScript('');
          setNotice('Payment received. Your video is being made: about 10 minutes.');
        } else {
          setNotice("Payment received. Fill this in and make your video: it's already paid for.");
        }
      } catch (err) {
        setError(apiErrorMessage(err, "Couldn't confirm the payment. Reload in a moment: you won't be charged twice."));
      } finally {
        queryClient.invalidateQueries({ queryKey: ['leagueVideos', leagueId] });
      }
    })();
  }, [paidSession, canceled, params, setParams, leagueId, queryClient]);

  // After a round trip to Stripe, bring the card back into view
  const cameBack = handledReturn.current !== null;
  const loaded = Boolean(data?.canCreate);
  useEffect(() => {
    if (cameBack && loaded) cardRef.current?.scrollIntoView({ block: 'start' });
  }, [cameBack, loaded]);

  if (!data?.canCreate) return null;

  const mine = data.videos.filter((v) => v.mine);
  const max = data.maxScriptChars;
  const length = script.trim().length;
  const canMake = Boolean(photo) && consent && length >= MIN_SCRIPT_CHARS && length <= max;
  const needsPayment = data.access === 'paid' && !data.hasCredit;
  const busy = create.isPending || checkout.isPending;

  return (
    <div ref={cardRef} className="card p-4 sm:p-6 mb-4 sm:mb-6 scroll-mt-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="label text-amber-700">Commissioner</span>
        <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">Video message</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Make an AI video of yourself reading your own script, then send it to the whole league in one tap.
        It takes about 10 minutes to make.
        {data.access === 'paid' && ` ${formatPrice(data.priceCents)} per video.`}
      </p>
      {notice && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>
      )}
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
      {data.canDraft && (
        <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <label htmlFor="video-notes" className="block text-sm font-semibold text-gray-800 mb-1.5">
            Want a first draft?
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="video-notes"
              type="text"
              maxLength={data.maxNotesChars}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: anything it should know? e.g. James is my brother"
              className="min-w-0 flex-1 px-3.5 py-2.5 text-base bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            />
            <Button variant="outline" onClick={() => draft.mutate()} disabled={draft.isPending} className="shrink-0">
              <Sparkle size={18} weight="fill" aria-hidden />
              {draft.isPending ? 'Writing...' : script.trim() ? 'Write another' : 'Write it for me'}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            AI writes it from your league's standings, rosters and swaps. Read it over and make it yours.
          </p>
        </div>
      )}
      <textarea
        id="video-script"
        rows={5}
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

      <Button onClick={() => (needsPayment ? checkout.mutate() : create.mutate())} disabled={!canMake || busy}>
        <VideoCamera size={18} weight="bold" aria-hidden />
        {busy ? 'Starting...' : needsPayment ? `Pay ${formatPrice(data.priceCents)} and make my video` : 'Make my video'}
      </Button>
      {data.access === 'paid' && (
        <p className="text-xs text-gray-500 mt-2">
          {data.hasCredit
            ? "You have a video paid for. This one won't charge you."
            : 'Secure checkout by Stripe. If a video fails, your next try is free.'}
        </p>
      )}

      {mine.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
          <p className="label">Your videos</p>
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
