/**
 * Season Service (D6)
 *
 * The week model comes from ESPN's official calendar, never from local math:
 * ESPN has no "Week 0" (the late-August openers are inside Week 1), weeks
 * end at midnight Pacific and shift with DST, and the regular season is
 * seasontype 2 (weeks 1–15 in 2026, ending with Army-Navy). Bowls/CFP are
 * seasontype 3 and are simply never synced.
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
  let weeks = await prisma.seasonWeek.findMany({
    where: { seasonYear },
    orderBy: { weekNumber: 'asc' },
  });

  if (weeks.length === 0) {
    await syncSeasonCalendar(seasonYear);
    weeks = await prisma.seasonWeek.findMany({
      where: { seasonYear },
      orderBy: { weekNumber: 'asc' },
    });
  }

  if (weeks.length === 0) {
    throw new Error(`No season calendar available for ${seasonYear}`);
  }

  const active = weeks.find((w) => now >= w.startDate && now <= w.endDate);
  if (active) return active.weekNumber;

  if (now < weeks[0].startDate) return weeks[0].weekNumber;
  return weeks[weeks.length - 1].weekNumber;
}
