/**
 * ESPN-driven seed (WS7): conference membership comes live from ESPN's core
 * API for the season (so realignment is a re-run, not a code change), names
 * and abbreviations from the site catalog, and the SeasonWeek calendar is
 * ingested alongside. Idempotent — teams are keyed by espnTeamId.
 *
 * Slot rules (league decisions D3/amended):
 *  - SEC, Big Ten, Big 12 slots = their conferences; ACC + Notre Dame share
 *  - "Group of 6" = AAC, CUSA, MAC, Mountain West, Sun Belt, rebuilt Pac-12
 *  - Other independents (UConn) are unslotted (NONE) — visible, not draftable
 */

import { PrismaClient, ConferenceSlot } from '@prisma/client';
import {
  fetchTeamCatalog,
  fetchConferenceTeamIds,
} from '../src/services/espnClient';
import { syncSeasonCalendar } from '../src/services/seasonService';

const prisma = new PrismaClient();

const SEASON_YEAR = 2026;

// ESPN conference group IDs (verified against the 2026 core API)
const CONFERENCES: { label: string; espnGroupId: number; slot: ConferenceSlot }[] = [
  { label: 'SEC', espnGroupId: 8, slot: ConferenceSlot.SEC },
  { label: 'Big Ten', espnGroupId: 5, slot: ConferenceSlot.BIG_TEN },
  { label: 'ACC', espnGroupId: 1, slot: ConferenceSlot.ACC_ND },
  { label: 'Big 12', espnGroupId: 4, slot: ConferenceSlot.BIG_12 },
  { label: 'American', espnGroupId: 151, slot: ConferenceSlot.G6 },
  { label: 'CUSA', espnGroupId: 12, slot: ConferenceSlot.G6 },
  { label: 'MAC', espnGroupId: 15, slot: ConferenceSlot.G6 },
  { label: 'Mountain West', espnGroupId: 17, slot: ConferenceSlot.G6 },
  { label: 'Pac-12', espnGroupId: 9, slot: ConferenceSlot.G6 },
  { label: 'Sun Belt', espnGroupId: 37, slot: ConferenceSlot.G6 },
  { label: 'Independent', espnGroupId: 18, slot: ConferenceSlot.NONE },
];

// Per-team slot overrides, keyed by ESPN team ID
const SLOT_OVERRIDES: Record<string, ConferenceSlot> = {
  '87': ConferenceSlot.ACC_ND, // Notre Dame drafts in the ACC slot
};

async function main() {
  console.log(`🏈 Seeding teams from ESPN for the ${SEASON_YEAR} season...\n`);

  const catalog = await fetchTeamCatalog();
  console.log(`   Catalog: ${catalog.size} teams known to ESPN`);

  const seenEspnIds = new Set<string>();
  let upserts = 0;
  const warnings: string[] = [];

  for (const conf of CONFERENCES) {
    const ids = await fetchConferenceTeamIds(SEASON_YEAR, conf.espnGroupId);
    console.log(`   ${conf.label}: ${ids.length} teams`);

    for (const espnId of ids) {
      const entry = catalog.get(espnId);
      if (!entry) {
        warnings.push(`No catalog entry for ESPN id ${espnId} (${conf.label}) — skipped`);
        continue;
      }

      seenEspnIds.add(espnId);
      const slot = SLOT_OVERRIDES[espnId] ?? conf.slot;

      const data = {
        name: entry.location,
        conference: conf.label,
        slot,
        abbreviation: entry.abbreviation,
        espnDisplayName: entry.displayName,
        // The Odds API uses full team names that match ESPN display names
        oddsApiName: entry.displayName,
      };

      const existing = await prisma.team.findFirst({ where: { espnTeamId: espnId } });

      try {
        if (existing) {
          await prisma.team.update({ where: { id: existing.id }, data });
        } else {
          await prisma.team.create({ data: { ...data, espnTeamId: espnId } });
        }
        upserts++;
      } catch (e: any) {
        // Unique-name collision (e.g. an FCS stub already holds this name):
        // keep the existing name, update everything else
        if (e.code === 'P2002') {
          const { name, ...rest } = data;
          if (existing) {
            await prisma.team.update({ where: { id: existing.id }, data: rest });
            upserts++;
            warnings.push(`Name collision for "${name}" (ESPN ${espnId}) — kept existing name`);
          } else {
            warnings.push(`Create collision for "${name}" (ESPN ${espnId}) — skipped`);
          }
        } else {
          throw e;
        }
      }
    }
  }

  // Teams that used to be slotted but are no longer in any 2026 conference
  // (left FBS, or data drift) fall out of the draft pool
  const demoted = await prisma.team.updateMany({
    where: {
      slot: { not: ConferenceSlot.NONE },
      OR: [
        { espnTeamId: null },
        { espnTeamId: { notIn: [...seenEspnIds] } },
      ],
    },
    data: { slot: ConferenceSlot.NONE },
  });
  if (demoted.count > 0) {
    console.log(`   Demoted ${demoted.count} team(s) no longer in a ${SEASON_YEAR} conference`);
  }

  // Season calendar (D6) rides along so a fresh DB is fully bootstrapped
  await syncSeasonCalendar(SEASON_YEAR);

  const bySlot = await prisma.team.groupBy({ by: ['slot'], _count: { _all: true } });

  console.log('\n✅ Seed complete! Teams per draft slot:');
  for (const row of bySlot.sort((a, b) => a.slot.localeCompare(b.slot))) {
    console.log(`   ${row.slot}: ${row._count._all}`);
  }
  if (warnings.length) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach((w) => console.log(`   - ${w}`));
  }
  console.log(`\n   ${upserts} teams upserted from ESPN. Idempotent — safe to re-run.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
