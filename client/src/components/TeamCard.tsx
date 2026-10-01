/**
 * Team card: tap a team on My Team or Week by Week and its season opens in a
 * sheet (bottom sheet on phones, centered dialog from `sm` up). Modeled on
 * ESPN fantasy's player card minus the roster moves: a header in the team's
 * color, a stat strip (Pick 6 points, record, rank, FPI SOS), then tabs for
 * the tapped game, the season (results with each game's Pick 6 points, then
 * the games still to play, byes included: a bye scores 0) and ESPN
 * headlines. Lines are the stored ones scoring uses, and points come from
 * the server (pointsForTeam); nothing is scored here.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowSquareOut, CaretRight, Newspaper, PlayCircle, X } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { teamApi, TeamCardData, TeamCardGame, TeamHeadline } from '../services/api';
import { ErrorMessage } from './ErrorMessage';

export interface TeamCardTarget {
  teamId: number;
  teamName: string; // header text while the card loads
  userId?: number; // whose roster it was tapped on
  eventId?: string | null; // the tapped game; none = the team's live/next game
  week?: number; // the tapped week (a bye has no game)
}

interface TeamCardProps {
  leagueId: number;
  target: TeamCardTarget;
  onClose: () => void;
}

type CardTab = 'matchup' | 'season' | 'news';

const TABS: { id: CardTab; label: string }[] = [
  { id: 'matchup', label: 'Matchup' },
  { id: 'season', label: 'Season' },
  { id: 'news', label: 'News' },
];

type Owner = TeamCardData['owner'];

// ---------- formatting ----------

// Team-relative spread (+3.5 = underdog by 3.5)
function formatSpread(spread: number): string {
  if (spread === 0) return 'PK';
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

function pointsColor(points: number): string {
  return points > 0 ? 'text-green-700' : points < 0 ? 'text-red-600' : 'text-gray-400';
}

function formatKickoff(game: TeamCardGame): string {
  const date = new Date(game.startTime);
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (game.timeTbd) return `${day}, time TBD`;
  return `${day}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ESPN team colors run from navy to bright yellow: darken until white text
// reads on it (relative luminance <= 0.18 is about 4.5:1 against white)
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function headerColor(hex: string | null | undefined): string {
  if (!hex) return '#14532d'; // green-900, the app header
  let rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < 12 && luminance(rgb) > 0.18; i++) {
    rgb = rgb.map((c) => Math.round(c * 0.85));
  }
  return `rgb(${rgb.join(', ')})`;
}

const NEWS_TYPE_LABELS: Record<string, string> = {
  Story: 'Story',
  HeadlineNews: 'News',
  Recap: 'Recap',
  Preview: 'Preview',
  Media: 'Video',
};

// ---------- season rows ----------

type SeasonRow = { kind: 'game'; game: TeamCardGame } | { kind: 'bye'; week: number };

/**
 * The whole season in week order, played and upcoming together, with a bye
 * row for every week the team is off. Byes only fill weeks up to the team's
 * last known game, so a missing ESPN schedule never reads as a run of byes.
 */
function seasonRows(card: TeamCardData): SeasonRow[] {
  const lastKnownWeek = Math.max(0, ...card.games.map((g) => g.week));
  const weeks = new Set(card.games.map((g) => g.week));
  for (let week = 1; week <= lastKnownWeek; week++) weeks.add(week);

  return [...weeks]
    .sort((a, b) => a - b)
    .flatMap((week): SeasonRow[] => {
      const games = card.games.filter((g) => g.week === week);
      return games.length > 0
        ? games.map((game): SeasonRow => ({ kind: 'game', game }))
        : [{ kind: 'bye', week }];
    });
}

// ---------- small pieces ----------

function TeamLogo({ src, className }: { src: string | null | undefined; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className={`${className} rounded-full bg-gray-200`} aria-hidden />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} object-contain`}
    />
  );
}

function WeekBadge({ week, current }: { week: number; current: boolean }) {
  return (
    <span
      className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-display font-bold text-base ${
        current ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' : 'bg-gray-100 text-gray-600'
      }`}
      title={`Week ${week}`}
    >
      {week}
    </span>
  );
}

// Same badges as the Week by Week drill-down
function ResultChip({ game }: { game: TeamCardGame }) {
  if (game.result === 'W') {
    return (
      <span className={`px-1.5 py-0.5 rounded font-display font-bold uppercase tracking-wide text-xs ${
        game.wasUpset ? 'bg-green-700 text-white' : 'bg-green-100 text-green-800'
      }`}>
        {game.wasUpset ? 'Upset W' : 'W'}
      </span>
    );
  }
  if (game.result === 'L') {
    return (
      <span className={`px-1.5 py-0.5 rounded font-display font-bold uppercase tracking-wide text-xs ${
        game.wasUpset ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'
      }`}>
        {game.wasUpset ? 'Bust L' : 'L'}
      </span>
    );
  }
  return null;
}

function opponentLabel(game: TeamCardGame) {
  return (
    <>
      {game.isHome || game.neutralSite ? 'vs' : 'at'}{' '}
      {game.opponent.rank && (
        <span className="font-display font-bold text-amber-700">#{game.opponent.rank} </span>
      )}
      {game.opponent.name}
    </>
  );
}

function rosterNote(game: TeamCardGame, owner: Owner, myId: number | undefined): string | null {
  if (game.counted || !owner) return null;
  return owner.userId === myId ? 'Not on your roster' : `Not on ${firstName(owner.userName)}'s roster`;
}

// ---------- rows ----------

function GameRow({
  game,
  currentWeek,
  owner,
  myId,
  onSelect,
}: {
  game: TeamCardGame;
  currentWeek: number;
  owner: Owner;
  myId: number | undefined;
  onSelect: () => void;
}) {
  const live = game.status === 'in_progress';
  const final = game.status === 'final';
  const note = rosterNote(game, owner, myId);

  let meta: React.ReactNode;
  if (final) {
    meta = (
      <>
        <ResultChip game={game} />
        {game.teamScore !== null && game.opponentScore !== null && (
          <span className="tabular-nums">{game.teamScore}-{game.opponentScore}</span>
        )}
        <span className="text-gray-400">
          {game.teamSpread !== null ? `line ${formatSpread(game.teamSpread)}` : 'no line'}
        </span>
      </>
    );
  } else if (live) {
    meta = (
      <>
        <span className="font-display font-bold uppercase tracking-wide text-red-600">Live</span>
        {game.statusDetail && <span>{game.statusDetail}</span>}
        {game.teamScore !== null && game.opponentScore !== null && (
          <span className="tabular-nums font-semibold text-gray-800">{game.teamScore}-{game.opponentScore}</span>
        )}
      </>
    );
  } else if (game.status === 'cancelled' || game.status === 'postponed') {
    meta = (
      <span className={game.status === 'cancelled' ? 'text-red-600 font-semibold' : 'text-orange-600 font-semibold'}>
        {game.status === 'cancelled' ? 'Cancelled' : 'Postponed'}
      </span>
    );
  } else {
    meta = (
      <>
        <span>{formatKickoff(game)}</span>
        {game.broadcast && <span className="font-semibold text-gray-700">{game.broadcast}</span>}
        {game.teamSpread !== null && (
          <span className="text-gray-400">line {formatSpread(game.teamSpread)}</span>
        )}
      </>
    );
  }

  // Right column: Pick 6 points, once the game is final. Lines stay in the
  // meta line so a +1 here is never mistaken for a spread.
  let right: React.ReactNode = null;
  if (final) {
    right =
      game.points !== null ? (
        <span
          className={`font-display font-bold text-xl leading-none ${game.counted ? pointsColor(game.points) : 'text-gray-300'}`}
          title={game.counted ? 'Pick 6 points' : 'Pick 6 points (did not count for this roster)'}
        >
          {formatPoints(game.points)}
        </span>
      ) : (
        <span className="text-gray-300 font-display font-bold text-xl leading-none" title="Scores at the next sync">
          ·
        </span>
      );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:bg-gray-50"
      >
        <WeekBadge week={game.week} current={game.week === currentWeek} />
        <TeamLogo src={game.opponent.logo} className="w-7 h-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{opponentLabel(game)}</p>
          <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
            {meta}
            {game.playedWeek !== game.week && (
              <span className="text-amber-700">played wk {game.playedWeek}</span>
            )}
            {note && <span className="text-amber-700">{note}</span>}
          </p>
        </div>
        <div className="shrink-0 w-10 text-right">{right}</div>
        <CaretRight size={14} weight="bold" className="shrink-0 text-gray-300" aria-hidden />
      </button>
    </li>
  );
}

function ByeRow({ week, currentWeek }: { week: number; currentWeek: number }) {
  return (
    <li className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
      <WeekBadge week={week} current={week === currentWeek} />
      <span className="w-7 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-400">Bye</p>
        <p className="text-xs text-gray-400 mt-0.5">No game, no points</p>
      </div>
      <span className="shrink-0 w-10 text-right font-display font-bold text-xl leading-none text-gray-300">0</span>
      <span className="w-3.5 shrink-0" aria-hidden />
    </li>
  );
}

// ---------- panels ----------

function SeasonList({
  card,
  myId,
  onSelect,
}: {
  card: TeamCardData;
  myId: number | undefined;
  onSelect: (game: TeamCardGame) => void;
}) {
  const rows = seasonRows(card);
  if (rows.length === 0) {
    return <p className="px-4 sm:px-5 py-8 text-center text-sm text-gray-500">No games on the schedule yet.</p>;
  }
  return (
    <div className="pb-1">
      {/* Column heads, aligned with the rows below */}
      <div className="flex items-center gap-3 px-4 sm:px-5 pt-2.5 pb-1 label text-[10px]" aria-hidden>
        <span className="w-8 text-center">Wk</span>
        <span className="flex-1 pl-10">Opponent</span>
        <span className="w-10 text-right">Pts</span>
        <span className="w-3.5" />
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((row) =>
          row.kind === 'bye' ? (
            <ByeRow key={`bye-${row.week}`} week={row.week} currentWeek={card.currentWeek} />
          ) : (
            <GameRow
              key={row.game.espnEventId}
              game={row.game}
              currentWeek={card.currentWeek}
              owner={card.owner}
              myId={myId}
              onSelect={() => onSelect(row.game)}
            />
          )
        )}
      </ul>
    </div>
  );
}

function MatchupSide({
  logo,
  name,
  rank,
  record,
  score,
  dim,
}: {
  logo: string | null;
  name: string;
  rank: number | null;
  record: string | null;
  score: number | null;
  dim: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center min-w-0">
      <TeamLogo src={logo} className="w-14 h-14 sm:w-16 sm:h-16" />
      <p className="mt-1.5 font-display font-bold uppercase tracking-wide text-base sm:text-lg leading-tight text-gray-900 max-w-full truncate">
        {rank && <span className="text-amber-700">#{rank} </span>}
        {name}
      </p>
      {record && <p className="text-xs text-gray-500">{record}</p>}
      {score !== null && (
        <p className={`font-display font-extrabold text-4xl leading-none mt-1 tabular-nums ${dim ? 'text-gray-400' : 'text-gray-900'}`}>
          {score}
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      <dt className="label w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-gray-800">{children}</dd>
    </div>
  );
}

function MatchupPanel({
  card,
  game,
  byeWeek,
  color,
  myId,
}: {
  card: TeamCardData;
  game: TeamCardGame | null;
  byeWeek: number | null;
  color: string;
  myId: number | undefined;
}) {
  if (!game) {
    return <p className="px-4 sm:px-5 py-8 text-center text-sm text-gray-500">No games on the schedule yet.</p>;
  }

  const team = card.team;
  const live = game.status === 'in_progress';
  const final = game.status === 'final';
  const upcoming = game.status === 'scheduled' || game.status === 'postponed';
  const spread = game.teamSpread;
  const predictor = card.previewEventId === game.espnEventId ? card.predictor : null;
  const note = rosterNote(game, card.owner, myId);

  let status: string;
  if (live) status = `Live${game.statusDetail ? ` · ${game.statusDetail}` : ''}`;
  else if (final) status = game.statusDetail || 'Final';
  else if (game.status === 'postponed') status = 'Postponed';
  else if (game.status === 'cancelled') status = 'Cancelled';
  else status = formatKickoff(game);

  let lineText: string;
  if (spread === null) lineText = upcoming ? 'No line yet. Odds sync daily until kickoff.' : 'No line: scored as a plain result';
  else if (spread >= 3.5) lineText = `${team.abbreviation ?? team.name} ${formatSpread(spread)}: underdog of 3.5+`;
  else if (spread <= -3.5) lineText = `${team.abbreviation ?? team.name} ${formatSpread(spread)}: favorite of 3.5+`;
  else lineText = `${team.abbreviation ?? team.name} ${formatSpread(spread)}: inside 3.5, regular scoring`;

  // What the result is worth, from the stored line (the league's rules)
  const winPts = spread !== null && spread >= 3.5 ? 2 : 1;
  const lossPts = spread !== null && spread <= -3.5 ? -1 : 0;

  let pickSix: React.ReactNode = null;
  if (final && game.points !== null) {
    const why =
      game.result === 'W'
        ? game.wasUpset ? 'won as an underdog of 3.5+' : 'win'
        : game.result === 'L'
        ? game.wasUpset ? 'lost as a favorite of 3.5+' : 'loss'
        : 'no decision';
    pickSix = (
      <span>
        <span className={`font-display font-bold text-lg leading-none ${game.counted ? pointsColor(game.points) : 'text-gray-400'}`}>
          {formatPoints(game.points)}
        </span>{' '}
        <span className="text-gray-500">{why}</span>
      </span>
    );
  } else if (final) {
    pickSix = <span className="text-gray-500">Scores at the next sync</span>;
  } else if (game.status === 'cancelled') {
    pickSix = <span className="text-gray-500">Cancelled games score 0</span>;
  }

  return (
    <div className="px-4 sm:px-5 py-4 space-y-4">
      {byeWeek !== null && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Off in week {byeWeek}: no game, no points. {upcoming || live ? 'Next up:' : 'Most recent game:'}
        </p>
      )}

      <div>
        <p className={`label text-center ${live ? 'text-red-600' : ''}`}>
          Week {game.week} · {status}
        </p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <MatchupSide
            logo={team.logo}
            name={team.abbreviation ?? team.name}
            rank={upcoming ? team.apRank : game.teamRank}
            record={upcoming ? team.record : null}
            score={game.teamScore}
            dim={final && game.result === 'L'}
          />
          <span className="label text-gray-400 px-1">{game.isHome || game.neutralSite ? 'vs' : 'at'}</span>
          <MatchupSide
            logo={game.opponent.logo}
            name={game.opponent.abbreviation ?? game.opponent.name}
            rank={game.opponent.rank}
            record={upcoming ? game.opponent.record : null}
            score={game.opponentScore}
            dim={final && game.result === 'W'}
          />
        </div>
        {(game.playedWeek !== game.week || note) && (
          <p className="text-xs text-amber-700 text-center mt-2">
            {game.playedWeek !== game.week &&
              `Played in week ${game.playedWeek}; counts as week ${game.week} because the team was off then. `}
            {note && `${note} in week ${game.week}, so it didn't count there.`}
          </p>
        )}
      </div>

      {predictor && (
        <div>
          <p className="label mb-1.5">ESPN matchup predictor</p>
          <div className="flex justify-between text-sm font-semibold tabular-nums">
            <span className="text-gray-900">{team.abbreviation ?? team.name} {predictor.teamWinPct.toFixed(1)}%</span>
            <span className="text-gray-500">{predictor.opponentWinPct.toFixed(1)}% {game.opponent.abbreviation ?? game.opponent.name}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${predictor.teamWinPct}%`, backgroundColor: color }} />
          </div>
        </div>
      )}

      <dl className="divide-y divide-gray-100 border-y border-gray-100">
        <DetailRow label="Line">{lineText}</DetailRow>
        {pickSix ? (
          <DetailRow label="Pick 6">{pickSix}</DetailRow>
        ) : (
          <DetailRow label="At stake">
            <span className="font-semibold">
              Win <span className="text-green-700">+{winPts}</span> · Loss{' '}
              <span className={lossPts < 0 ? 'text-red-600' : 'text-gray-500'}>{lossPts}</span>
            </span>
          </DetailRow>
        )}
        {!upcoming && <DetailRow label="Kickoff">{formatKickoff(game)}</DetailRow>}
        {game.venue && (
          <DetailRow label="Where">
            {game.venue}
            {game.neutralSite && <span className="text-gray-500"> (neutral site)</span>}
          </DetailRow>
        )}
        {game.broadcast && <DetailRow label="TV">{game.broadcast}</DetailRow>}
      </dl>

      {game.espnUrl && (
        <a
          href={game.espnUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-800 underline underline-offset-2"
        >
          {final ? 'Box score on ESPN' : live ? 'Gamecast on ESPN' : 'Game preview on ESPN'}
          <ArrowSquareOut size={14} weight="bold" aria-hidden />
        </a>
      )}
    </div>
  );
}

function NewsPanel({ news, espnUrl, teamName }: { news: TeamHeadline[]; espnUrl: string | null; teamName: string }) {
  return (
    <div className="py-1">
      {news.length === 0 ? (
        <p className="px-4 sm:px-5 py-8 text-center text-sm text-gray-500">No recent ESPN headlines.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {news.map((item) => {
            const video = item.type === 'Media';
            const Icon = video ? PlayCircle : Newspaper;
            return (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 sm:px-5 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100"
                >
                  <Icon size={20} weight={video ? 'fill' : 'regular'} className="shrink-0 mt-0.5 text-green-700" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900 leading-snug">{item.headline}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {NEWS_TYPE_LABELS[item.type] ?? 'Story'} · {timeAgo(item.published)}
                    </span>
                  </span>
                  <ArrowSquareOut size={14} weight="bold" className="shrink-0 mt-1 text-gray-300" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {espnUrl && (
        <a
          href={espnUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 sm:px-5 py-3 text-sm font-semibold text-green-800 underline underline-offset-2"
        >
          More {teamName} on ESPN
          <ArrowSquareOut size={14} weight="bold" aria-hidden />
        </a>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass = 'text-gray-900',
  title,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
  title?: string;
}) {
  return (
    <div className="px-2 py-2.5 text-center min-w-0" title={title}>
      <p className="label text-[10px] sm:text-[11px]">{label}</p>
      <p className={`font-display font-bold text-2xl leading-none mt-1 tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 truncate">{sub}</p>
    </div>
  );
}

// ---------- the card ----------

export function TeamCard({ leagueId, target, onClose }: TeamCardProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<CardTab>('matchup');
  // Tapping a game in the log or schedule puts it on the Matchup tab
  const [eventId, setEventId] = useState<string | null>(target.eventId ?? null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { data: card, error } = useQuery({
    queryKey: ['teamCard', leagueId, target.teamId, target.userId ?? null, eventId],
    queryFn: () => teamApi.getTeamCard(leagueId, target.teamId, { eventId, userId: target.userId }),
    // A newly tapped game shows at once from the games already loaded
    placeholderData: keepPreviousData,
    // Live game: keep the score moving (the server caches ESPN for 60s)
    refetchInterval: (query) =>
      query.state.data?.games.some((g) => g.status === 'in_progress') ? 60000 : false,
  });

  // Escape closes, the page behind doesn't scroll, focus returns on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const overflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const showTab = (next: CardTab) => {
    setTab(next);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const team = card?.team;
  const games = card?.games ?? [];
  const preview =
    games.find((g) => g.espnEventId === eventId) ??
    games.find((g) => g.espnEventId === card?.previewEventId) ??
    null;
  // A bye tile opens on the team's next game, with a note saying so
  const byeWeek =
    eventId === null && !target.eventId && target.week !== undefined && card && !games.some((g) => g.week === target.week)
      ? target.week
      : null;
  const color = headerColor(team?.color);
  const owner = card?.owner ?? null;
  const ownerIsMe = owner?.userId === user?.id;
  const ownerLine = owner
    ? `${ownerIsMe ? 'Your team' : `${owner.userName}'s team`}${
        owner.toWeek !== null ? ` through week ${owner.toWeek}` : owner.fromWeek > 1 ? ` from week ${owner.fromWeek}` : ''
      }`
    : null;
  const pick6 = card?.pick6;
  const ownerDiffers = owner && pick6 && pick6.ownerPoints !== null && pick6.ownerPoints !== pick6.points;

  // Portaled to <body>: the tabs render it inside space-y containers, whose
  // sibling margins would otherwise shift a fixed overlay
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-card-title"
        // Fixed height so the header doesn't jump as tabs change length
        className="w-full sm:max-w-xl h-[92dvh] sm:h-[min(44rem,88dvh)] flex flex-col overflow-hidden bg-white rounded-t-2xl sm:rounded-xl shadow-card-lg animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header in the team's color */}
        <div
          className="relative shrink-0 px-4 sm:px-5 pt-4 pb-4 text-white"
          style={{
            backgroundColor: color,
            backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(0,0,0,0.25))',
          }}
        >
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-2.5 right-2.5 w-10 h-10 flex items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={22} weight="bold" />
          </button>
          <div className="flex items-center gap-3 sm:gap-4 pr-10">
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-white shadow-card flex items-center justify-center shrink-0">
              <TeamLogo src={team?.logo} className="w-11 h-11 sm:w-12 sm:h-12" />
            </div>
            <div className="min-w-0">
              <p className="font-display font-semibold uppercase tracking-wider text-xs text-white/70">
                {team?.slotLabel ?? 'Team'}
              </p>
              <h2
                id="team-card-title"
                className="flex items-center gap-2 font-display font-bold uppercase tracking-wide text-[28px] sm:text-3xl leading-none mt-1"
              >
                {team?.apRank && (
                  <span className="bg-amber-400 text-amber-950 text-sm px-1.5 py-0.5 rounded leading-none shrink-0">
                    #{team.apRank}
                  </span>
                )}
                <span className="truncate">{team?.name ?? target.teamName}</span>
              </h2>
              {team && (
                <p className="text-sm text-white/80 mt-1.5 truncate">
                  {[team.standing ?? team.conference, ownerLine].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stat strip */}
        {card && team && pick6 && (
          <div className="shrink-0 grid grid-cols-4 divide-x divide-gray-200 border-b border-gray-200">
            <Stat
              label="Pick 6"
              value={formatPoints(pick6.points)}
              valueClass={pick6.points === 0 ? 'text-gray-900' : pointsColor(pick6.points)}
              sub={
                ownerDiffers
                  ? `${formatPoints(pick6.ownerPoints!)} for ${ownerIsMe ? 'you' : firstName(owner!.userName)}`
                  : 'season pts'
              }
              title="Pick 6 points this team has scored this season"
            />
            <Stat label="Record" value={team.record ?? '0-0'} sub="overall" />
            <Stat label="Rank" value={team.apRank ? `#${team.apRank}` : 'NR'} sub="Top 25" />
            <Stat
              label="SOS"
              value={team.sosRank ? ordinal(team.sosRank) : '-'}
              sub={team.sosRank && team.sosOutOf ? `of ${team.sosOutOf}` : 'not ranked'}
              title="ESPN FPI strength of schedule (games played): 1 is the hardest in FBS. The standings tiebreaker adds these up."
            />
          </div>
        )}

        {/* Tabs */}
        <div role="tablist" className="shrink-0 flex overflow-x-auto no-scrollbar border-b border-gray-200 px-2 sm:px-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => showTab(t.id)}
              className={`shrink-0 px-3 py-2.5 -mb-px border-b-2 font-display font-bold uppercase tracking-wide text-sm transition-colors touch-manipulation ${
                tab === t.id
                  ? 'border-green-700 text-green-800'
                  : 'border-transparent text-gray-500 hover:text-gray-800 active:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {error ? (
            <div className="p-4 sm:p-5">
              <ErrorMessage message="Couldn't load this team. Try again in a minute." />
            </div>
          ) : !card ? (
            <div className="py-12 text-center">
              <div
                className="inline-block animate-spin rounded-full border-[3px] border-green-200 border-t-green-700 h-8 w-8"
                role="status"
                aria-label="Loading"
              />
            </div>
          ) : tab === 'matchup' ? (
            <MatchupPanel card={card} game={preview} byeWeek={byeWeek} color={color} myId={user?.id} />
          ) : tab === 'news' ? (
            <NewsPanel news={card.news} espnUrl={card.team.espnUrl} teamName={card.team.name} />
          ) : (
            <SeasonList
              card={card}
              myId={user?.id}
              onSelect={(game) => {
                setEventId(game.espnEventId);
                showTab('matchup');
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
