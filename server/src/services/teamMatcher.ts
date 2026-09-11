/**
 * Team Matcher Service
 *
 * Handles matching between:
 * - Our database teams
 * - ESPN team data
 * - Odds API team names
 *
 * Team names vary across sources, so we need fuzzy matching logic.
 */

import prisma from '../lib/prisma';
import { ParsedGame } from './espnClient';
import { ParsedOdds } from './oddsClient';

// Common team name variations and aliases
const TEAM_ALIASES: Record<string, string[]> = {
  // SEC
  Alabama: ['Alabama Crimson Tide', 'Bama'],
  Georgia: ['Georgia Bulldogs', 'UGA'],
  Texas: ['Texas Longhorns'],
  LSU: ['LSU Tigers', 'Louisiana State'],
  Tennessee: ['Tennessee Volunteers', 'Vols'],
  Florida: ['Florida Gators', 'UF'],
  Auburn: ['Auburn Tigers'],
  'Texas A&M': ['Texas A&M Aggies', 'TAMU'],
  Oklahoma: ['Oklahoma Sooners', 'OU'],
  'Ole Miss': ['Mississippi Rebels', 'Ole Miss Rebels', 'Mississippi'],
  Missouri: ['Missouri Tigers', 'Mizzou'],
  Arkansas: ['Arkansas Razorbacks'],
  'South Carolina': ['South Carolina Gamecocks'],
  'Mississippi State': ['Mississippi State Bulldogs', 'Miss State'],
  Kentucky: ['Kentucky Wildcats'],
  Vanderbilt: ['Vanderbilt Commodores', 'Vandy'],

  // Big Ten
  'Ohio State': ['Ohio State Buckeyes', 'OSU'],
  Michigan: ['Michigan Wolverines'],
  'Penn State': ['Penn State Nittany Lions'],
  Oregon: ['Oregon Ducks'],
  USC: ['USC Trojans', 'Southern California', 'Southern Cal'],
  Washington: ['Washington Huskies', 'UW'],
  Wisconsin: ['Wisconsin Badgers'],
  Iowa: ['Iowa Hawkeyes'],
  Nebraska: ['Nebraska Cornhuskers'],
  'Michigan State': ['Michigan State Spartans', 'MSU'],
  Minnesota: ['Minnesota Golden Gophers'],
  Maryland: ['Maryland Terrapins', 'Terps'],
  Rutgers: ['Rutgers Scarlet Knights'],
  Indiana: ['Indiana Hoosiers'],
  Northwestern: ['Northwestern Wildcats'],
  Purdue: ['Purdue Boilermakers'],
  Illinois: ['Illinois Fighting Illini'],
  UCLA: ['UCLA Bruins'],

  // ACC
  Clemson: ['Clemson Tigers'],
  'Florida State': ['Florida State Seminoles', 'FSU'],
  Miami: ['Miami Hurricanes', 'Miami FL', 'Miami (FL)'],
  'North Carolina': ['North Carolina Tar Heels', 'UNC'],
  'NC State': ['NC State Wolfpack', 'North Carolina State'],
  'Virginia Tech': ['Virginia Tech Hokies', 'VT'],
  Louisville: ['Louisville Cardinals'],
  Duke: ['Duke Blue Devils'],
  Virginia: ['Virginia Cavaliers', 'UVA'],
  Pitt: ['Pittsburgh Panthers', 'Pittsburgh'],
  'Georgia Tech': ['Georgia Tech Yellow Jackets', 'GT'],
  'Boston College': ['Boston College Eagles', 'BC'],
  Syracuse: ['Syracuse Orange'],
  'Wake Forest': ['Wake Forest Demon Deacons'],
  California: ['California Golden Bears', 'Cal'],
  Stanford: ['Stanford Cardinal'],
  SMU: ['SMU Mustangs', 'Southern Methodist'],

  // Big 12
  Utah: ['Utah Utes'],
  'Kansas State': ['Kansas State Wildcats', 'K-State'],
  'Oklahoma State': ['Oklahoma State Cowboys', 'OSU Cowboys'],
  TCU: ['TCU Horned Frogs'],
  Baylor: ['Baylor Bears'],
  'Texas Tech': ['Texas Tech Red Raiders'],
  Kansas: ['Kansas Jayhawks', 'KU'],
  'Iowa State': ['Iowa State Cyclones'],
  'West Virginia': ['West Virginia Mountaineers', 'WVU'],
  UCF: ['UCF Knights', 'Central Florida'],
  Cincinnati: ['Cincinnati Bearcats'],
  BYU: ['BYU Cougars', 'Brigham Young'],
  Houston: ['Houston Cougars'],
  Arizona: ['Arizona Wildcats'],
  'Arizona State': ['Arizona State Sun Devils', 'ASU'],
  Colorado: ['Colorado Buffaloes'],

  // Independents
  'Notre Dame': ['Notre Dame Fighting Irish'],
  Army: ['Army Black Knights', 'Army West Point'],
  UMass: ['UMass Minutemen', 'Massachusetts'],

  // Group of 5 (partial list)
  'Boise State': ['Boise State Broncos'],
  Memphis: ['Memphis Tigers'],
  Tulane: ['Tulane Green Wave'],
  'Miami (OH)': ['Miami (Ohio) RedHawks', 'Miami Ohio'],
};

// Build reverse lookup map
const ALIAS_TO_NAME: Map<string, string> = new Map();
for (const [name, aliases] of Object.entries(TEAM_ALIASES)) {
  ALIAS_TO_NAME.set(name.toLowerCase(), name);
  for (const alias of aliases) {
    ALIAS_TO_NAME.set(alias.toLowerCase(), name);
  }
}

/**
 * Normalize a team name for comparison
 */
export function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Fold diacritics (San José → San Jose)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars (Hawai'i → Hawaii)
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Find the canonical team name from any alias
 */
export function findCanonicalName(input: string): string | null {
  // Exact alias match only. A substring pass used to live here, but the
  // alias table is deliberately partial (no Texas State, no Miami (OH)
  // variants), so "Texas State Bobcats" resolved to Texas and "Miami (OH)
  // RedHawks" to Miami (FL). Unknown names return null and are compared
  // as plain strings instead.
  return ALIAS_TO_NAME.get(normalizeTeamName(input)) ?? null;
}

/**
 * Do two team names (ESPN display name vs The Odds API name) refer to the
 * same school? True on an exact normalized match, a shared alias-table
 * canonical name, or, as a last resort for name variants like "Southern
 * Miss" vs "Southern Mississippi", the same first word AND the same mascot.
 * Two names that both miss the alias table are NOT a match by default: the
 * old `findCanonicalName(a) === findCanonicalName(b)` check compared
 * null === null and matched any two unlisted teams, which is how Hawai'i vs
 * UNLV inherited a -29.5 line from another 10pm ET kickoff in week 1.
 */
export function teamNamesAgree(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ca = findCanonicalName(a);
  const cb = findCanonicalName(b);
  if (ca !== null && cb !== null) return ca === cb;

  // "southern miss golden eagles" vs "southern mississippi golden eagles",
  // "miami hurricanes" vs "miami fl hurricanes": same leading word and same
  // mascot. Still separates Texas/Texas State (Longhorns/Bobcats) and
  // Miami/Miami (OH) (Hurricanes/RedHawks).
  const wa = na.split(' ');
  const wb = nb.split(' ');
  if (wa.length >= 2 && wb.length >= 2) {
    return wa[0] === wb[0] && wa[wa.length - 1] === wb[wb.length - 1];
  }
  return false;
}

/**
 * Match a team name to our database team by ESPN ID
 */
export async function findTeamByEspnId(espnId: string) {
  return prisma.team.findFirst({
    where: { espnTeamId: espnId },
  });
}

/**
 * Match a team name to our database team by name/alias
 */
export async function findTeamByName(name: string) {
  // First try exact match
  let team = await prisma.team.findFirst({
    where: { name },
  });

  if (team) return team;

  // Try canonical name
  const canonical = findCanonicalName(name);
  if (canonical) {
    team = await prisma.team.findFirst({
      where: { name: canonical },
    });
  }

  return team;
}

/**
 * Match an ESPN game to an Odds API event: same kickoff (±window) AND both
 * teams agree by name. If the book lists home/away the other way round
 * (neutral-site games do this), the returned copy is flipped so `spread`
 * is still the ESPN home team's spread.
 */
export function matchGameToOdds(
  game: ParsedGame,
  allOdds: ParsedOdds[],
  timeWindowMinutes: number = 60
): ParsedOdds | null {
  const gameTime = game.startTime.getTime();
  const espnHome = game.homeTeam.displayName;
  const espnAway = game.awayTeam.displayName;

  for (const odds of allOdds) {
    const timeDiff = Math.abs(gameTime - odds.commenceTime.getTime());
    if (timeDiff > timeWindowMinutes * 60 * 1000) {
      continue;
    }

    if (teamNamesAgree(espnHome, odds.homeTeam) && teamNamesAgree(espnAway, odds.awayTeam)) {
      return odds;
    }

    if (teamNamesAgree(espnHome, odds.awayTeam) && teamNamesAgree(espnAway, odds.homeTeam)) {
      return {
        ...odds,
        homeTeam: odds.awayTeam,
        awayTeam: odds.homeTeam,
        spread: odds.spread === null ? null : -odds.spread,
        favoriteTeam:
          odds.favoriteTeam === 'home' ? 'away' : odds.favoriteTeam === 'away' ? 'home' : null,
      };
    }
  }

  return null;
}

/**
 * League rule: upset modifiers only apply at a spread of 3.5 or more —
 * a +3.5-or-greater underdog winning pays +2, a -3.5-or-greater favorite
 * losing pays -1. Smaller spreads (and pick'ems) score as regular results.
 */
export const UPSET_SPREAD_THRESHOLD = 3.5;

/**
 * Determine if a game result was an upset based on spread
 */
export function wasUpset(
  winnerIsHome: boolean,
  spread: number | null
): boolean {
  if (spread === null) {
    // No spread data available, can't determine upset
    return false;
  }

  if (Math.abs(spread) < UPSET_SPREAD_THRESHOLD) {
    return false;
  }

  // spread < 0 means home team was favored
  // spread > 0 means away team was favored
  const homeFavored = spread < 0;

  if (winnerIsHome) {
    // Home team won - upset if they were NOT favored
    return !homeFavored;
  } else {
    // Away team won - upset if home WAS favored
    return homeFavored;
  }
}

/**
 * Get all teams from database with ESPN IDs
 */
export async function getTeamsWithEspnIds() {
  return prisma.team.findMany({
    where: {
      espnTeamId: { not: null },
    },
  });
}
