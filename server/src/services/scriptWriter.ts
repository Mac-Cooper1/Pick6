/**
 * "Write it for me" for the commissioner videos (Oct 10): Claude drafts a
 * roast-style script from the league's own season.
 *
 * The fact sheet holds only what every member can already see in the app:
 * standings, weekly points, draft positions, current rosters with each
 * team's results, and the public swap recap (who swapped what, which choice
 * it was, how long each list was). Swap lists stay private: it reads the
 * same getSwapState view the Week 6 Swap tab shows, never the claims table.
 * The commissioner can add a note for what the data can't know ("James is
 * my brother").
 *
 * One Claude call through the official SDK. The draft is a starting point:
 * it lands in the script box, where the commissioner edits it.
 */

import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { errorMessage } from '../utils/errors';
import { getAllRosters } from './rosterService';
import { loadScoringWeekMap, pointsForTeam, seasonRecord } from './scoringWeekService';
import { getCurrentWeek } from './seasonService';
import { getStandings } from './standingsService';
import { getSwapState } from './swapService';

export const MAX_SCRIPT_CHARS = 600; // about 40 seconds of speech
export const MAX_NOTES_CHARS = 300;
export const DRAFTS_PER_DAY = 10; // each costs the host about a tenth of a cent on Haiku

// Mac's call (Oct 10): Haiku, about a tenth of a cent a draft against ~3 cents
// on Opus 5.5, since drafts are free to people who may never pay for a video.
// VIDEO_SCRIPT_MODEL=claude-opus-5-5 (or claude-sonnet-5-5) for sharper jokes.
const DEFAULT_MODEL = 'claude-haiku-5-5';
// Models whose refusals can be re-run on another model inside the same
// request (Haiku has no server-side fallback: a refusal is just reported)
const SERVER_FALLBACK_MODELS = /^claude-(opus-5|fable-5-1|sonnet-5-5)/;

// The model call, swappable so the smoke test runs without a key
export type CompleteScript = (system: string, user: string) => Promise<string>;

const SYSTEM_PROMPT = `You write short scripts that the commissioner of a friends' college football pick'em league reads on camera to the league. It becomes an AI talking-head video, played for laughs among friends who all know each other.

Write one script in the commissioner's own voice (first person).

Hard limits:
- 430 to 560 characters in total, counting spaces. The video tool rejects anything over 600, so stay under.
- Use only what is in the fact sheet and the commissioner's notes. Never invent a result, a number, a nickname or a relationship.

What makes it good:
- A friendly roast. Tease three to five people by first name about what they actually did this season: drafted first and sits fifth, turned in no swap list, dropped a team that was winning. The leader, last place and the commissioner's own standing are usually worth a line, and the commissioner should take a shot at themselves.
- Jokes land on football decisions only. Nothing about anyone's looks, body, health, money, job, family troubles, religion, race, gender or sexuality. Nothing sexual, no slurs, no threats, nothing crueler than friends would say to each other's faces.
- If the notes mention how people are related or an inside joke, use it.

It will be read aloud by a text-to-speech voice, so:
- Plain spoken sentences. Write numbers as words ("twenty-four points", "five and one"). No abbreviations a voice would stumble over.
- No emojis, hashtags, stage directions, quotation marks, lists or line breaks.
- Open in character for the setting (a press-conference statement, a locker-room speech) and end with a short sign-off.

Reply with the script text and nothing else.`;

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** The league's season as plain text, public information only */
export async function buildLeagueFacts(leagueId: number, userId: number): Promise<string> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new AppError('League not found', 404);

  const [standings, weekly, swap, rosters, currentWeek] = await Promise.all([
    getStandings(leagueId),
    prisma.weeklyScore.findMany({ where: { leagueId }, orderBy: { weekNumber: 'asc' } }),
    getSwapState(leagueId, userId),
    getAllRosters(leagueId),
    getCurrentWeek(league.seasonYear),
  ]);
  const speaker = standings.find((s) => s.member.userId === userId);
  const scoringWeeks = await loadScoringWeekMap(
    league.seasonYear,
    rosters.flatMap((r) => r.roster.map((t) => t.teamId))
  );

  const lines: string[] = [
    `League: ${league.name} (${standings.length} players), ${league.seasonYear} season, week ${currentWeek}.`,
    'Scoring per team per week: +1 for a win, +2 for a win as an underdog of 3.5 or more, 0 for a loss, -1 for a loss as a favorite of 3.5 or more.',
    `The commissioner (the speaker): ${speaker?.member.user.name ?? 'unknown'}.`,
    '',
    'Standings (place, name, total points, points week by week, draft position):',
  ];
  standings.forEach(({ member, points }, index) => {
    const byWeek = weekly
      .filter((w) => w.userId === member.userId)
      .map((w) => `week ${w.weekNumber}: ${w.points}`)
      .join(', ');
    lines.push(
      `${index + 1}. ${member.user.name}: ${points} points (${byWeek || 'no weeks scored yet'})` +
        (member.draftPosition ? `; drafted ${ordinal(member.draftPosition)} of ${standings.length}` : '')
    );
  });

  if (swap.phase === 'complete') {
    lines.push('', `Week ${swap.swapWeek} swap (already ran; worst record chose first, one same-conference swap each):`);
    for (const entry of swap.order) {
      const list = entry.listSize === 0 ? 'turned in no list' : `turned in a list of ${entry.listSize}`;
      lines.push(
        `- ${ordinal(entry.position)} to choose, ${entry.userName}: ${list}; ` +
          (entry.swap
            ? `dropped ${entry.swap.dropTeamName} and added ${entry.swap.addTeamName} (their choice number ${entry.swap.choice})`
            : 'made no swap')
      );
    }
  }

  lines.push('', 'Rosters (each team: wins-losses this season, Pick 6 points it has scored):');
  for (const { userName, roster } of rosters) {
    const teams = roster.map((team) => {
      const record = seasonRecord(scoringWeeks, team.teamId);
      let upsetWins = 0;
      let busts = 0;
      for (const games of scoringWeeks.get(team.teamId)?.values() ?? []) {
        for (const game of games) {
          const points = pointsForTeam(game, team.teamId);
          if (points === 2) upsetWins++;
          if (points === -1) busts++;
        }
      }
      const notes = [
        upsetWins ? `${upsetWins} upset win${upsetWins > 1 ? 's' : ''}` : '',
        busts ? `lost ${busts} time${busts > 1 ? 's' : ''} as a big favorite` : '',
        team.fromWeek > 1 ? `added in the week ${team.fromWeek} swap` : '',
      ].filter(Boolean);
      return `${team.teamName} ${record.wins}-${record.losses}, ${record.points} pts${notes.length ? ` (${notes.join(', ')})` : ''}`;
    });
    lines.push(`- ${userName}: ${teams.join('; ') || 'no teams yet'}`);
  }
  return lines.join('\n');
}

let client: Anthropic | null = null;

export function isScriptWriterConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** One Claude call: system prompt + fact sheet in, script text out */
const completeWithClaude: CompleteScript = async (system, user) => {
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 });
  const model = process.env.VIDEO_SCRIPT_MODEL || DEFAULT_MODEL;
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      // Thinking is adaptive and on by default; effort is the depth control
      output_config: { effort: 'medium' },
      // If the model's safety classifiers decline, re-run on Anthropic's
      // recommended fallback inside this same request
      ...(SERVER_FALLBACK_MODELS.test(model)
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') {
      throw new AppError("Couldn't write a draft from that. Try different notes, or write your own.", 422);
    }
    return response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Ours to fix, not the user's: a bad key, no credit on the Anthropic
    // account (a 400), or a model id that doesn't exist. Retrying won't help.
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error instanceof Anthropic.BadRequestError ||
      error instanceof Anthropic.NotFoundError
    ) {
      console.error(`[Script] Anthropic ${error.status}: ${error.message}`);
      throw new AppError('The script writer is not available right now. You can still write your own.', 503);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AppError('The script writer is busy. Try again in a minute.', 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[Script] Anthropic ${error.status}: ${error.message}`);
      throw new AppError("Couldn't write a draft right now. Try again in a minute.", 502);
    }
    console.error(`[Script] ${errorMessage(error)}`);
    throw new AppError("Couldn't write a draft right now. Try again in a minute.", 502);
  }
};

/** Tidy what came back, and never hand the form more than it accepts */
export function cleanScript(raw: string): string {
  let script = raw.replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (script.length > MAX_SCRIPT_CHARS) {
    // Cut at the last full sentence that fits
    const head = script.slice(0, MAX_SCRIPT_CHARS);
    const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
    script = end > 200 ? head.slice(0, end + 1) : head.trim();
  }
  return script;
}

const draftsByUser = new Map<number, number[]>();

/** A draft costs the host money and is free to the commissioner: cap it per day */
function takeDraftSlot(userId: number, now: number): boolean {
  const recent = (draftsByUser.get(userId) ?? []).filter((t) => now - t < 24 * 3600 * 1000);
  if (recent.length >= DRAFTS_PER_DAY) {
    draftsByUser.set(userId, recent);
    return false;
  }
  draftsByUser.set(userId, [...recent, now]);
  return true;
}

export async function draftScript(
  leagueId: number,
  userId: number,
  input: { notes?: unknown; setting?: unknown },
  { complete = completeWithClaude, now = Date.now() }: { complete?: CompleteScript; now?: number } = {}
): Promise<string> {
  const notes = typeof input.notes === 'string' ? input.notes.trim().replace(/\s+/g, ' ') : '';
  if (notes.length > MAX_NOTES_CHARS) {
    throw new AppError(`Keep the notes under ${MAX_NOTES_CHARS} characters`, 400);
  }
  if (!takeDraftSlot(userId, now)) {
    throw new AppError(`That's ${DRAFTS_PER_DAY} drafts today. Edit the last one, or try again tomorrow.`, 429);
  }

  const facts = await buildLeagueFacts(leagueId, userId);
  const setting = typeof input.setting === 'string' && input.setting ? input.setting : 'Press conference';
  const user = [
    `Setting for the video: ${setting}.`,
    notes ? `The commissioner's notes (true; work them in): ${notes}` : "The commissioner left no notes.",
    '',
    'Fact sheet:',
    facts,
  ].join('\n');

  const script = cleanScript(await complete(SYSTEM_PROMPT, user));
  if (script.length < 40) {
    throw new AppError("Couldn't write a draft right now. Try again in a minute.", 502);
  }
  return script;
}
