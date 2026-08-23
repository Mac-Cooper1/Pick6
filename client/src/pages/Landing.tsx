import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { Logo, Mark } from '../components/Logo';
import { RankBadge, SCORING } from '../components/LeaderboardTab';

/**
 * Signed-out landing page. Signed-in users skip straight to their leagues.
 *
 * The hero visual is a real mini-version of the app's leaderboard and week
 * cards (same markup and classes as the Leaderboard / Week by Week tabs) with
 * clearly-labelled sample data, not a fake screenshot.
 */

const SAMPLE_STANDINGS = [
  { rank: 1, name: 'Tate', points: 23 },
  { rank: 2, name: 'Marcus', points: 19 },
  { rank: 3, name: 'Priya', points: 17 },
  { rank: 4, name: 'Reilly', points: 12 },
];

const SAMPLE_WEEK = [
  { slot: 'SEC', team: 'Ole Miss', opp: 'vs LSU', spread: '+6.5', result: 'Upset W', pts: '+2', tone: 'bg-green-700 text-white' },
  { slot: 'Big Ten', team: 'Oregon', opp: '@ Penn State', spread: '-3.5', result: 'Bust L', pts: '-1', tone: 'bg-red-600 text-white' },
  { slot: 'Group of 6', team: 'Boise State', opp: 'vs UNLV', spread: '-10', result: 'W', pts: '+1', tone: 'bg-green-100 text-green-800' },
];

const STEPS = [
  {
    title: 'Join with a code',
    body: 'Your commissioner sends a six-letter code. Make an account, type it in, and you are on the board.',
  },
  {
    title: 'Draft five teams, one per slot',
    body: 'A live snake draft with a pick clock. SEC, Big Ten, ACC and Notre Dame, Big 12, and a Group of 6 team.',
  },
  {
    title: 'Score every Saturday',
    body: 'Scores and betting lines pull in automatically. Wins add up, upsets pay double, and big favorites that lose cost you.',
  },
];

const SLOTS = [
  { name: 'SEC', detail: '16 teams' },
  { name: 'Big Ten', detail: '18 teams' },
  { name: 'ACC + ND', detail: 'ACC plus Notre Dame' },
  { name: 'Big 12', detail: '16 teams' },
  { name: 'Group of 6', detail: 'AAC, CUSA, MAC, MWC, Sun Belt, Pac-12', wild: true },
];

const DATES = [
  { date: 'Aug 27', label: 'Kickoff' },
  { date: 'Sep 5', label: 'Drafts close' },
  { date: 'Oct 4', label: 'Swap window opens' },
  { date: 'Dec 12', label: 'Final week' },
];

export function Landing() {
  const { user, isLoading } = useAuth();
  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-[100dvh] bg-gray-100 text-gray-900">
      {/* Hero on the brand green */}
      <section className="bg-green-900 text-white">
        <header className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo tone="dark" />
          <Link
            to="/login"
            className="inline-flex items-center min-h-[2.5rem] px-4 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 hover:bg-white/20 active:bg-white/5 transition-colors"
          >
            Sign in
          </Link>
        </header>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16 sm:pt-16 sm:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          <div className="lg:col-span-7">
            <h1 className="animate-rise font-display font-extrabold uppercase leading-[0.95] tracking-tight text-5xl sm:text-6xl lg:text-7xl">
              Draft five teams.
              <br />
              <span className="text-amber-400">Sweat every Saturday.</span>
            </h1>
            <p className="animate-rise [animation-delay:120ms] mt-5 sm:mt-6 text-lg sm:text-xl text-white/80 max-w-[36rem] leading-relaxed">
              A college football pick'em for your group chat. One team per conference, points for wins,
              bonuses for upsets.
            </p>
            <div className="animate-rise [animation-delay:240ms] mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to="/login?mode=signup"
                className="inline-flex items-center justify-center gap-2 min-h-[3rem] px-6 rounded-lg font-semibold bg-amber-400 text-gray-950 hover:bg-amber-300 active:bg-amber-500 active:translate-y-px transition-[background-color,transform] shadow-sm"
              >
                Join your league
                <ArrowRight size={18} weight="bold" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center min-h-[3rem] px-6 rounded-lg font-semibold bg-white/10 border border-white/15 hover:bg-white/20 active:bg-white/5 transition-colors"
              >
                How it works
              </a>
            </div>
          </div>

          {/* Real component preview with sample data */}
          <div className="lg:col-span-5 animate-rise [animation-delay:200ms]">
            <div className="card overflow-hidden text-gray-900 shadow-card-lg">
              <div className="px-4 py-3 border-b border-gray-200 flex items-baseline justify-between">
                <span className="font-display font-bold uppercase tracking-wide text-lg">Leaderboard</span>
                <span className="label">Sample</span>
              </div>
              <table className="w-full">
                <tbody>
                  {SAMPLE_STANDINGS.map((s) => (
                    <tr key={s.rank} className={`border-b border-gray-100 ${s.rank === 3 ? 'bg-green-50' : ''}`}>
                      <td className="pl-4 pr-2 py-2 w-14"><RankBadge rank={s.rank} /></td>
                      <td className="px-2 py-2">
                        <span className={s.rank === 1 ? 'font-bold' : 'font-medium'}>{s.name}</span>
                        {s.rank === 3 && <span className="label ml-2 text-green-700">You</span>}
                      </td>
                      <td className="pl-2 pr-4 py-2 text-right font-display font-bold text-2xl leading-none text-green-700">
                        {s.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 bg-gray-50">
                <div className="label mb-2">Week 3, your teams</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                  {SAMPLE_WEEK.map((t) => (
                    <div key={t.team} className="bg-white border border-gray-200 rounded-lg p-2.5 text-xs">
                      <div className="label text-[11px]">{t.slot}</div>
                      <div className="font-semibold text-sm">{t.team}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-gray-500">
                          {t.opp} <span className="text-gray-400">({t.spread})</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded font-display font-bold uppercase tracking-wide text-xs ${t.tone}`}>
                            {t.result}
                          </span>
                          <span className={`font-display font-bold text-base leading-none ${t.pts.startsWith('-') ? 'text-red-600' : 'text-green-700'}`}>
                            {t.pts}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works: numbered vertical stack */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="section-title text-3xl sm:text-4xl">How it works</h2>
        <ol className="mt-8 sm:mt-10 grid grid-cols-1 gap-6 sm:gap-8 max-w-3xl">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[5rem_1fr] gap-4 items-start">
              <span className="font-display font-extrabold text-5xl sm:text-6xl leading-none text-green-700/40 tabular-nums">
                {i + 1}
              </span>
              <div className="pt-1 sm:pt-2">
                <h3 className="font-display font-bold uppercase tracking-wide text-2xl leading-none">{step.title}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed max-w-[60ch]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Five slots: one strip, scroll-snaps on phones */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <h2 className="section-title text-3xl sm:text-4xl">One team from each slot</h2>
        <p className="section-sub text-base max-w-[60ch]">
          No stacking the SEC. Every roster covers the whole country, and no two players can own the same team.
        </p>
        <div className="mt-6 sm:mt-8 -mx-4 px-4 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-5 gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {SLOTS.map((slot) => (
            <div
              key={slot.name}
              className={`snap-start shrink-0 w-[9.5rem] sm:w-auto rounded-xl border p-4 min-h-[8rem] flex flex-col justify-between ${
                slot.wild
                  ? 'bg-amber-400 border-amber-400 text-gray-950'
                  : 'bg-green-900 border-green-900 text-white'
              }`}
            >
              <span className="font-display font-extrabold uppercase leading-none text-3xl">{slot.name}</span>
              <span className={`text-xs mt-4 ${slot.wild ? 'text-gray-900/80' : 'text-white/70'}`}>{slot.detail}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Scoring: 2x2 tinted tiles */}
      <section className="bg-white border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-5">
            <h2 className="section-title text-3xl sm:text-4xl">Scoring rewards guts</h2>
            <p className="mt-3 text-gray-600 leading-relaxed max-w-[48ch]">
              Each of your teams scores once a week based on the result and the closing line. Picking a
              live underdog beats picking the obvious favorite.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-2 gap-3 sm:gap-4">
            {SCORING.map((s) => (
              <div key={s.title} className={`rounded-xl border p-4 sm:p-5 ${s.tone}`}>
                <div className="font-display font-extrabold text-4xl sm:text-5xl leading-none">{s.pts}</div>
                <div className="font-semibold mt-3">{s.title}</div>
                <div className="text-sm mt-0.5 opacity-80 leading-snug">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Week 5 swap: statement band */}
      <section className="bg-green-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="flex items-start gap-4 sm:gap-6">
            <Mark className="w-12 h-12 sm:w-16 sm:h-16 shrink-0" inverted />
            <div>
              <h2 className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-4xl sm:text-5xl lg:text-6xl">
                One swap after week 5.
              </h2>
              <p className="mt-4 text-lg text-white/80 max-w-[50ch] leading-relaxed">
                Drafted a dud? Everyone gets a single same-slot swap, worst record picks first. Past
                weeks stay scored as they were.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Season dates + closing CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {DATES.map((d) => (
            <div key={d.date} className="border-t-2 border-green-700 pt-3">
              <div className="font-display font-extrabold text-3xl sm:text-4xl leading-none">{d.date}</div>
              <div className="text-sm text-gray-600 mt-1">{d.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <p className="font-display font-bold uppercase tracking-wide text-2xl sm:text-3xl leading-none">
            2026 season. No bowls, no playoff, just Saturdays.
          </p>
          <Link
            to="/login?mode=signup"
            className="inline-flex items-center justify-center gap-2 min-h-[3rem] px-6 rounded-lg font-semibold bg-green-700 text-white hover:bg-green-800 active:bg-green-900 active:translate-y-px transition-[background-color,transform] shadow-sm sm:ml-auto shrink-0"
          >
            Join your league
            <ArrowRight size={18} weight="bold" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-500">
          <Logo tone="light" size="sm" />
          <p>Scores and lines from ESPN. Built for one friends league.</p>
        </div>
      </footer>
    </div>
  );
}
