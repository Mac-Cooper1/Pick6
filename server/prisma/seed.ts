import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Teams with ESPN IDs for automated scoring integration
// ESPN team IDs can be found at: https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams
const teams = [
  // SEC (16 teams)
  { name: 'Alabama', conference: 'SEC', abbreviation: 'ALA', espnTeamId: '333' },
  { name: 'Georgia', conference: 'SEC', abbreviation: 'UGA', espnTeamId: '61' },
  { name: 'Texas', conference: 'SEC', abbreviation: 'TEX', espnTeamId: '251' },
  { name: 'LSU', conference: 'SEC', abbreviation: 'LSU', espnTeamId: '99' },
  { name: 'Tennessee', conference: 'SEC', abbreviation: 'TENN', espnTeamId: '2633' },
  { name: 'Florida', conference: 'SEC', abbreviation: 'FLA', espnTeamId: '57' },
  { name: 'Auburn', conference: 'SEC', abbreviation: 'AUB', espnTeamId: '2' },
  { name: 'Texas A&M', conference: 'SEC', abbreviation: 'TAMU', espnTeamId: '245' },
  { name: 'Oklahoma', conference: 'SEC', abbreviation: 'OU', espnTeamId: '201' },
  { name: 'Ole Miss', conference: 'SEC', abbreviation: 'MISS', espnTeamId: '145' },
  { name: 'Missouri', conference: 'SEC', abbreviation: 'MIZ', espnTeamId: '142' },
  { name: 'Arkansas', conference: 'SEC', abbreviation: 'ARK', espnTeamId: '8' },
  { name: 'South Carolina', conference: 'SEC', abbreviation: 'SC', espnTeamId: '2579' },
  { name: 'Mississippi State', conference: 'SEC', abbreviation: 'MSST', espnTeamId: '344' },
  { name: 'Kentucky', conference: 'SEC', abbreviation: 'UK', espnTeamId: '96' },
  { name: 'Vanderbilt', conference: 'SEC', abbreviation: 'VAN', espnTeamId: '238' },

  // Big Ten (18 teams)
  { name: 'Ohio State', conference: 'Big Ten', abbreviation: 'OSU', espnTeamId: '194' },
  { name: 'Michigan', conference: 'Big Ten', abbreviation: 'MICH', espnTeamId: '130' },
  { name: 'Penn State', conference: 'Big Ten', abbreviation: 'PSU', espnTeamId: '213' },
  { name: 'Oregon', conference: 'Big Ten', abbreviation: 'ORE', espnTeamId: '2483' },
  { name: 'USC', conference: 'Big Ten', abbreviation: 'USC', espnTeamId: '30' },
  { name: 'Washington', conference: 'Big Ten', abbreviation: 'WASH', espnTeamId: '264' },
  { name: 'Wisconsin', conference: 'Big Ten', abbreviation: 'WIS', espnTeamId: '275' },
  { name: 'Iowa', conference: 'Big Ten', abbreviation: 'IOWA', espnTeamId: '2294' },
  { name: 'Nebraska', conference: 'Big Ten', abbreviation: 'NEB', espnTeamId: '158' },
  { name: 'Michigan State', conference: 'Big Ten', abbreviation: 'MSU', espnTeamId: '127' },
  { name: 'Minnesota', conference: 'Big Ten', abbreviation: 'MINN', espnTeamId: '135' },
  { name: 'Maryland', conference: 'Big Ten', abbreviation: 'MD', espnTeamId: '120' },
  { name: 'Rutgers', conference: 'Big Ten', abbreviation: 'RUTG', espnTeamId: '164' },
  { name: 'Indiana', conference: 'Big Ten', abbreviation: 'IND', espnTeamId: '84' },
  { name: 'Northwestern', conference: 'Big Ten', abbreviation: 'NW', espnTeamId: '77' },
  { name: 'Purdue', conference: 'Big Ten', abbreviation: 'PUR', espnTeamId: '2509' },
  { name: 'Illinois', conference: 'Big Ten', abbreviation: 'ILL', espnTeamId: '356' },
  { name: 'UCLA', conference: 'Big Ten', abbreviation: 'UCLA', espnTeamId: '26' },

  // ACC (17 teams)
  { name: 'Clemson', conference: 'ACC', abbreviation: 'CLEM', espnTeamId: '228' },
  { name: 'Florida State', conference: 'ACC', abbreviation: 'FSU', espnTeamId: '52' },
  { name: 'Miami', conference: 'ACC', abbreviation: 'MIA', espnTeamId: '2390' },
  { name: 'North Carolina', conference: 'ACC', abbreviation: 'UNC', espnTeamId: '153' },
  { name: 'NC State', conference: 'ACC', abbreviation: 'NCST', espnTeamId: '152' },
  { name: 'Virginia Tech', conference: 'ACC', abbreviation: 'VT', espnTeamId: '259' },
  { name: 'Louisville', conference: 'ACC', abbreviation: 'LOU', espnTeamId: '97' },
  { name: 'Duke', conference: 'ACC', abbreviation: 'DUKE', espnTeamId: '150' },
  { name: 'Virginia', conference: 'ACC', abbreviation: 'UVA', espnTeamId: '258' },
  { name: 'Pitt', conference: 'ACC', abbreviation: 'PITT', espnTeamId: '221' },
  { name: 'Georgia Tech', conference: 'ACC', abbreviation: 'GT', espnTeamId: '59' },
  { name: 'Boston College', conference: 'ACC', abbreviation: 'BC', espnTeamId: '103' },
  { name: 'Syracuse', conference: 'ACC', abbreviation: 'SYR', espnTeamId: '183' },
  { name: 'Wake Forest', conference: 'ACC', abbreviation: 'WAKE', espnTeamId: '154' },
  { name: 'California', conference: 'ACC', abbreviation: 'CAL', espnTeamId: '25' },
  { name: 'Stanford', conference: 'ACC', abbreviation: 'STAN', espnTeamId: '24' },
  { name: 'SMU', conference: 'ACC', abbreviation: 'SMU', espnTeamId: '2567' },

  // Big 12 (16 teams)
  { name: 'Utah', conference: 'Big 12', abbreviation: 'UTAH', espnTeamId: '254' },
  { name: 'Kansas State', conference: 'Big 12', abbreviation: 'KSU', espnTeamId: '2306' },
  { name: 'Oklahoma State', conference: 'Big 12', abbreviation: 'OKST', espnTeamId: '197' },
  { name: 'TCU', conference: 'Big 12', abbreviation: 'TCU', espnTeamId: '2628' },
  { name: 'Baylor', conference: 'Big 12', abbreviation: 'BAY', espnTeamId: '239' },
  { name: 'Texas Tech', conference: 'Big 12', abbreviation: 'TTU', espnTeamId: '2641' },
  { name: 'Kansas', conference: 'Big 12', abbreviation: 'KU', espnTeamId: '2305' },
  { name: 'Iowa State', conference: 'Big 12', abbreviation: 'ISU', espnTeamId: '66' },
  { name: 'West Virginia', conference: 'Big 12', abbreviation: 'WVU', espnTeamId: '277' },
  { name: 'UCF', conference: 'Big 12', abbreviation: 'UCF', espnTeamId: '2116' },
  { name: 'Cincinnati', conference: 'Big 12', abbreviation: 'CIN', espnTeamId: '2132' },
  { name: 'BYU', conference: 'Big 12', abbreviation: 'BYU', espnTeamId: '252' },
  { name: 'Houston', conference: 'Big 12', abbreviation: 'HOU', espnTeamId: '248' },
  { name: 'Arizona', conference: 'Big 12', abbreviation: 'ARIZ', espnTeamId: '12' },
  { name: 'Arizona State', conference: 'Big 12', abbreviation: 'ASU', espnTeamId: '9' },
  { name: 'Colorado', conference: 'Big 12', abbreviation: 'COLO', espnTeamId: '38' },

  // Independent & Group of 5
  { name: 'Notre Dame', conference: 'Independent', abbreviation: 'ND', espnTeamId: '87' },
  { name: 'Army', conference: 'Independent', abbreviation: 'ARMY', espnTeamId: '349' },
  { name: 'UMass', conference: 'Independent', abbreviation: 'MASS', espnTeamId: '113' },

  // American Athletic Conference
  { name: 'Memphis', conference: 'American', abbreviation: 'MEM', espnTeamId: '235' },
  { name: 'Tulane', conference: 'American', abbreviation: 'TULN', espnTeamId: '2655' },
  { name: 'South Florida', conference: 'American', abbreviation: 'USF', espnTeamId: '58' },
  { name: 'Navy', conference: 'American', abbreviation: 'NAVY', espnTeamId: '2426' },
  { name: 'East Carolina', conference: 'American', abbreviation: 'ECU', espnTeamId: '151' },
  { name: 'Temple', conference: 'American', abbreviation: 'TEM', espnTeamId: '218' },
  { name: 'Tulsa', conference: 'American', abbreviation: 'TLSA', espnTeamId: '202' },
  { name: 'UTSA', conference: 'American', abbreviation: 'UTSA', espnTeamId: '2636' },
  { name: 'North Texas', conference: 'American', abbreviation: 'UNT', espnTeamId: '249' },
  { name: 'UAB', conference: 'American', abbreviation: 'UAB', espnTeamId: '5' },
  { name: 'Rice', conference: 'American', abbreviation: 'RICE', espnTeamId: '242' },
  { name: 'Florida Atlantic', conference: 'American', abbreviation: 'FAU', espnTeamId: '2226' },
  { name: 'Charlotte', conference: 'American', abbreviation: 'CLT', espnTeamId: '2429' },

  // Mountain West Conference
  { name: 'Boise State', conference: 'Mountain West', abbreviation: 'BSU', espnTeamId: '68' },
  { name: 'Fresno State', conference: 'Mountain West', abbreviation: 'FRES', espnTeamId: '278' },
  { name: 'San Diego State', conference: 'Mountain West', abbreviation: 'SDSU', espnTeamId: '21' },
  { name: 'Air Force', conference: 'Mountain West', abbreviation: 'AFA', espnTeamId: '2005' },
  { name: 'Colorado State', conference: 'Mountain West', abbreviation: 'CSU', espnTeamId: '36' },
  { name: 'Wyoming', conference: 'Mountain West', abbreviation: 'WYO', espnTeamId: '2751' },
  { name: 'UNLV', conference: 'Mountain West', abbreviation: 'UNLV', espnTeamId: '2439' },
  { name: 'Utah State', conference: 'Mountain West', abbreviation: 'USU', espnTeamId: '328' },
  { name: 'Nevada', conference: 'Mountain West', abbreviation: 'NEV', espnTeamId: '2440' },
  { name: 'New Mexico', conference: 'Mountain West', abbreviation: 'UNM', espnTeamId: '167' },
  { name: 'San Jose State', conference: 'Mountain West', abbreviation: 'SJSU', espnTeamId: '23' },
  { name: 'Hawaii', conference: 'Mountain West', abbreviation: 'HAW', espnTeamId: '62' },

  // Sun Belt Conference
  { name: 'Troy', conference: 'Sun Belt', abbreviation: 'TROY', espnTeamId: '2653' },
  { name: 'Coastal Carolina', conference: 'Sun Belt', abbreviation: 'CCU', espnTeamId: '324' },
  { name: 'James Madison', conference: 'Sun Belt', abbreviation: 'JMU', espnTeamId: '256' },
  { name: 'App State', conference: 'Sun Belt', abbreviation: 'APP', espnTeamId: '2026' },
  { name: 'Marshall', conference: 'Sun Belt', abbreviation: 'MRSH', espnTeamId: '276' },
  { name: 'Georgia State', conference: 'Sun Belt', abbreviation: 'GAST', espnTeamId: '2247' },
  { name: 'Georgia Southern', conference: 'Sun Belt', abbreviation: 'GASO', espnTeamId: '290' },
  { name: 'Louisiana', conference: 'Sun Belt', abbreviation: 'ULL', espnTeamId: '309' },
  { name: 'Arkansas State', conference: 'Sun Belt', abbreviation: 'ARST', espnTeamId: '2032' },
  { name: 'South Alabama', conference: 'Sun Belt', abbreviation: 'USA', espnTeamId: '6' },
  { name: 'Southern Miss', conference: 'Sun Belt', abbreviation: 'USM', espnTeamId: '2572' },
  { name: 'Old Dominion', conference: 'Sun Belt', abbreviation: 'ODU', espnTeamId: '295' },
  { name: 'Texas State', conference: 'Sun Belt', abbreviation: 'TXST', espnTeamId: '326' },
  { name: 'UL Monroe', conference: 'Sun Belt', abbreviation: 'ULM', espnTeamId: '2433' },

  // MAC (Mid-American Conference)
  { name: 'Toledo', conference: 'MAC', abbreviation: 'TOL', espnTeamId: '2649' },
  { name: 'Miami (OH)', conference: 'MAC', abbreviation: 'M-OH', espnTeamId: '193' },
  { name: 'Ohio', conference: 'MAC', abbreviation: 'OHIO', espnTeamId: '195' },
  { name: 'Northern Illinois', conference: 'MAC', abbreviation: 'NIU', espnTeamId: '2459' },
  { name: 'Western Michigan', conference: 'MAC', abbreviation: 'WMU', espnTeamId: '2711' },
  { name: 'Central Michigan', conference: 'MAC', abbreviation: 'CMU', espnTeamId: '2117' },
  { name: 'Eastern Michigan', conference: 'MAC', abbreviation: 'EMU', espnTeamId: '2199' },
  { name: 'Ball State', conference: 'MAC', abbreviation: 'BALL', espnTeamId: '2050' },
  { name: 'Bowling Green', conference: 'MAC', abbreviation: 'BGSU', espnTeamId: '189' },
  { name: 'Buffalo', conference: 'MAC', abbreviation: 'BUFF', espnTeamId: '2084' },
  { name: 'Kent State', conference: 'MAC', abbreviation: 'KENT', espnTeamId: '2309' },
  { name: 'Akron', conference: 'MAC', abbreviation: 'AKR', espnTeamId: '2006' },

  // Conference USA
  { name: 'Liberty', conference: 'CUSA', abbreviation: 'LIB', espnTeamId: '2335' },
  { name: 'Jacksonville State', conference: 'CUSA', abbreviation: 'JVST', espnTeamId: '55' },
  { name: 'New Mexico State', conference: 'CUSA', abbreviation: 'NMSU', espnTeamId: '166' },
  { name: 'Western Kentucky', conference: 'CUSA', abbreviation: 'WKU', espnTeamId: '98' },
  { name: 'MTSU', conference: 'CUSA', abbreviation: 'MTSU', espnTeamId: '2393' },
  { name: 'Louisiana Tech', conference: 'CUSA', abbreviation: 'LT', espnTeamId: '2348' },
  { name: 'Sam Houston', conference: 'CUSA', abbreviation: 'SHSU', espnTeamId: '2534' },
  { name: 'Kennesaw State', conference: 'CUSA', abbreviation: 'KENN', espnTeamId: '338' },
  { name: 'UTEP', conference: 'CUSA', abbreviation: 'UTEP', espnTeamId: '2638' },
  { name: 'FIU', conference: 'CUSA', abbreviation: 'FIU', espnTeamId: '2229' },
];

async function main() {
  console.log('🏈 Starting Pick6 database seed...');
  console.log(`📊 Seeding ${teams.length} teams...\n`);

  let created = 0;
  let updated = 0;

  // Use upsert for idempotent seeding - won't fail if teams already exist
  for (const team of teams) {
    const result = await prisma.team.upsert({
      where: { name: team.name },
      update: {
        conference: team.conference,
        abbreviation: team.abbreviation,
        espnTeamId: team.espnTeamId,
      },
      create: {
        name: team.name,
        conference: team.conference,
        abbreviation: team.abbreviation,
        espnTeamId: team.espnTeamId,
      },
    });

    // Check if it was created or updated by seeing if the data changed
    // (Prisma upsert doesn't tell us directly)
    const existing = await prisma.team.findUnique({ where: { name: team.name } });
    if (existing?.id === result.id) {
      updated++;
    } else {
      created++;
    }
  }

  console.log(`✅ Seeding complete!`);
  console.log(`   - Teams in database: ${teams.length}`);
  console.log(`   - This seed is idempotent - safe to run multiple times\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
