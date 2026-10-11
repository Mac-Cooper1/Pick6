/**
 * Season Service (D6)
 *
 * The week model comes from ESPN's official calendar, never from local math:
 * ESPN has no "Week 0" (the late-August openers are inside Week 1), weeks
 * end at midnight Pacific and shift with DST, and the regular season is
 * seasontype 2 (weeks 1–15 in 2026). Bowls/CFP are seasontype 3 and are
 * simply never synced.
 *
 * The Pick 6 season is shorter than ESPN's: it ends with the last full slate
 * (week 13 in 2026, rivalry week), see getSeasonWeeks.
 *
 * SeasonWeek rows are ingested once per season; the current week is derived
 * from the clock against those rows — nothing ever "advances" a stored week.
 */

import prisma from '../lib/prisma';

const ESPN_BASE_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

interface CalendarWeek {
  weekNumber: number;
  label: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Fetch the regular-season (seasontype 2) week calendar from ESPN
 */
export async function fetchSeasonCalendar(seasonYear: number): Promise<CalendarWeek[]> {
  // Any scoreboard response for the season carries the full calendar;
  // Sep 1 is always inside the season window.
  const url = `${ESPN_BASE_URL}/scoreboard?dates=${seasonYear}0901&limit=1`;
  console.log(`[Season] Fetching ${seasonYear} calendar from ESPN`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN calendar fetch failed: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const calendar = data?.leagues?.[0]?.calendar || [];
  const regularSeason = calendar.find((c: any) => String(c.value) === '2');

  if (!regularSeason?.entries?.length) {
    throw new Error(`ESPN calendar has no regular-season entries for ${seasonYear}`);
  }

  return regularSeason.entries.map((e: any) => ({
    weekNumber: parseInt(e.value, 10),
    label: e.label || `Week ${e.value}`,
    startDate: new Date(e.startDate),
    endDate: new Date(e.endDate),
  }));
}

/**
 * Ingest/refresh the SeasonWeek table for a season (idempotent)
 */
export async function syncSeasonCalendar(seasonYear: number): Promise<number> {
  const weeks = await fetchSeasonCalendar(seasonYear);

  for (const week of weeks) {
    await prisma.seasonWeek.upsert({
      where: {
        seasonYear_weekNumber: { seasonYear, weekNumber: week.weekNumber },
      },
      update: {
        label: week.label,
        startDate: week.startDate,
        endDate: week.endDate,
      },
      create: {
        seasonYear,
        weekNumber: week.weekNumber,
        label: week.label,
        startDate: week.startDate,
        endDate: week.endDate,
      },
    });
  }

  console.log(`[Season] Synced ${weeks.length} weeks for ${seasonYear}`);
  return weeks.length;
}

/**
 * CFB season year for a date: Jul–Dec belong to that year's season,
 * Jan–Jun to the previous one (bowls/offseason).
 */
export function getCurrentSeasonYear(now: Date = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// ESPN's regular season closes with two weeks Pick 6 doesn't play: the
// conference title games, then Army-Navy on its own (2026: weeks 14 and 15;
// 2024 and 2025: 15 and 16). Mac's rule (Oct 10): the season ends with the
// last full slate, so everyone finishes together and no title rides on one
// game two weeks later.
const ESPN_WEEKS_AFTER_PICK6 = 2;

/**
 * The Pick 6 season's weeks: ESPN's calendar without its last two. Every
 * "which week is it" and "which weeks exist" question reads this, never
 * SeasonWeek directly, so nothing after the final week is synced, scored
 * or shown as a week. (The week-6 swap reads its two weeks by number.)
 */
export async function getSeasonWeeks(seasonYear: number) {
  const weeks = await prisma.seasonWeek.findMany({
    where: { seasonYear },
    orderBy: { weekNumber: 'asc' },
  });
  return weeks.slice(0, Math.max(0, weeks.length - ESPN_WEEKS_AFTER_PICK6));
}

// Late finals, stat corrections and ESPN's Sunday rank refresh all land
// well inside two days of the last week closing
const SEASON_CLOSE_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * The season is closed 48 hours after its final week ends (2026: Wed Dec 2,
 * 3am ET; the last games are Sat Nov 28). From then on the scheduled sync is
 * a no-op and the standings tiebreaker stops moving, so the final
 * leaderboard stays final through the title games and bowls. False while
 * the calendar isn't ingested.
 */
export async function isSeasonOver(seasonYear: number, now: Date = new Date()): Promise<boolean> {
  const weeks = await getSeasonWeeks(seasonYear);
  const finalWeek = weeks[weeks.length - 1];
  return finalWeek !== undefined && now.getTime() > finalWeek.endDate.getTime() + SEASON_CLOSE_GRACE_MS;
}

/**
 * Derive the current week from the calendar. Before the season → week 1
 * (pre-season syncs prep the opening slate); after the last week → the final
 * week (the leaderboard freezes there). Lazily ingests the calendar on first
 * use for a season.
 */
export async function getCurrentWeek(
  seasonYear: number,
  now: Date = new Date()
): Promise<number> {
  let weeks = await getSeasonWeeks(seasonYear);

  if (weeks.length === 0) {
    await syncSeasonCalendar(seasonYear);
    weeks = await getSeasonWeeks(seasonYear);
  }

  if (weeks.length === 0) {
    throw new Error(`No season calendar available for ${seasonYear}`);
  }

  const active = weeks.find((w) => now >= w.startDate && now <= w.endDate);
  if (active) return active.weekNumber;

  if (now < weeks[0].startDate) return weeks[0].weekNumber;
  return weeks[weeks.length - 1].weekNumber;
}
