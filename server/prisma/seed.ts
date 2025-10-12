import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const teams = [
  // SEC (16 teams)
  { name: 'Alabama', conference: 'SEC' },
  { name: 'Georgia', conference: 'SEC' },
  { name: 'Texas', conference: 'SEC' },
  { name: 'LSU', conference: 'SEC' },
  { name: 'Tennessee', conference: 'SEC' },
  { name: 'Florida', conference: 'SEC' },
  { name: 'Auburn', conference: 'SEC' },
  { name: 'Texas A&M', conference: 'SEC' },
  { name: 'Oklahoma', conference: 'SEC' },
  { name: 'Ole Miss', conference: 'SEC' },
  { name: 'Missouri', conference: 'SEC' },
  { name: 'Arkansas', conference: 'SEC' },
  { name: 'South Carolina', conference: 'SEC' },
  { name: 'Mississippi State', conference: 'SEC' },
  { name: 'Kentucky', conference: 'SEC' },
  { name: 'Vanderbilt', conference: 'SEC' },

  // Big Ten (18 teams)
  { name: 'Ohio State', conference: 'Big Ten' },
  { name: 'Michigan', conference: 'Big Ten' },
  { name: 'Penn State', conference: 'Big Ten' },
  { name: 'Oregon', conference: 'Big Ten' },
  { name: 'USC', conference: 'Big Ten' },
  { name: 'Washington', conference: 'Big Ten' },
  { name: 'Wisconsin', conference: 'Big Ten' },
  { name: 'Iowa', conference: 'Big Ten' },
  { name: 'Nebraska', conference: 'Big Ten' },
  { name: 'Michigan State', conference: 'Big Ten' },
  { name: 'Minnesota', conference: 'Big Ten' },
  { name: 'Maryland', conference: 'Big Ten' },
  { name: 'Rutgers', conference: 'Big Ten' },
  { name: 'Indiana', conference: 'Big Ten' },
  { name: 'Northwestern', conference: 'Big Ten' },
  { name: 'Purdue', conference: 'Big Ten' },
  { name: 'Illinois', conference: 'Big Ten' },
  { name: 'UCLA', conference: 'Big Ten' },

  // ACC (17 teams)
  { name: 'Clemson', conference: 'ACC' },
  { name: 'Florida State', conference: 'ACC' },
  { name: 'Miami', conference: 'ACC' },
  { name: 'North Carolina', conference: 'ACC' },
  { name: 'NC State', conference: 'ACC' },
  { name: 'Virginia Tech', conference: 'ACC' },
  { name: 'Louisville', conference: 'ACC' },
  { name: 'Duke', conference: 'ACC' },
  { name: 'Virginia', conference: 'ACC' },
  { name: 'Pitt', conference: 'ACC' },
  { name: 'Georgia Tech', conference: 'ACC' },
  { name: 'Boston College', conference: 'ACC' },
  { name: 'Syracuse', conference: 'ACC' },
  { name: 'Wake Forest', conference: 'ACC' },
  { name: 'California', conference: 'ACC' },
  { name: 'Stanford', conference: 'ACC' },
  { name: 'SMU', conference: 'ACC' },

  // Big 12 (16 teams)
  { name: 'Utah', conference: 'Big 12' },
  { name: 'Kansas State', conference: 'Big 12' },
  { name: 'Oklahoma State', conference: 'Big 12' },
  { name: 'TCU', conference: 'Big 12' },
  { name: 'Baylor', conference: 'Big 12' },
  { name: 'Texas Tech', conference: 'Big 12' },
  { name: 'Kansas', conference: 'Big 12' },
  { name: 'Iowa State', conference: 'Big 12' },
  { name: 'West Virginia', conference: 'Big 12' },
  { name: 'UCF', conference: 'Big 12' },
  { name: 'Cincinnati', conference: 'Big 12' },
  { name: 'BYU', conference: 'Big 12' },
  { name: 'Houston', conference: 'Big 12' },
  { name: 'Arizona', conference: 'Big 12' },
  { name: 'Arizona State', conference: 'Big 12' },
  { name: 'Colorado', conference: 'Big 12' },

  // Independent & Group of 5
  { name: 'Notre Dame', conference: 'Independent' },
  { name: 'Army', conference: 'Independent' },
  { name: 'UMass', conference: 'Independent' },

  // American Athletic Conference
  { name: 'Memphis', conference: 'American' },
  { name: 'Tulane', conference: 'American' },
  { name: 'South Florida', conference: 'American' },
  { name: 'Navy', conference: 'American' },
  { name: 'East Carolina', conference: 'American' },
  { name: 'Temple', conference: 'American' },
  { name: 'Tulsa', conference: 'American' },
  { name: 'UTSA', conference: 'American' },
  { name: 'North Texas', conference: 'American' },
  { name: 'UAB', conference: 'American' },
  { name: 'Rice', conference: 'American' },
  { name: 'Florida Atlantic', conference: 'American' },
  { name: 'Charlotte', conference: 'American' },

  // Mountain West Conference
  { name: 'Boise State', conference: 'Mountain West' },
  { name: 'Fresno State', conference: 'Mountain West' },
  { name: 'San Diego State', conference: 'Mountain West' },
  { name: 'Air Force', conference: 'Mountain West' },
  { name: 'Colorado State', conference: 'Mountain West' },
  { name: 'Wyoming', conference: 'Mountain West' },
  { name: 'UNLV', conference: 'Mountain West' },
  { name: 'Utah State', conference: 'Mountain West' },
  { name: 'Nevada', conference: 'Mountain West' },
  { name: 'New Mexico', conference: 'Mountain West' },
  { name: 'San Jose State', conference: 'Mountain West' },
  { name: 'Hawaii', conference: 'Mountain West' },

  // Sun Belt Conference
  { name: 'Troy', conference: 'Sun Belt' },
  { name: 'Coastal Carolina', conference: 'Sun Belt' },
  { name: 'James Madison', conference: 'Sun Belt' },
  { name: 'App State', conference: 'Sun Belt' },
  { name: 'Marshall', conference: 'Sun Belt' },
  { name: 'Georgia State', conference: 'Sun Belt' },
  { name: 'Georgia Southern', conference: 'Sun Belt' },
  { name: 'Louisiana', conference: 'Sun Belt' },
  { name: 'Arkansas State', conference: 'Sun Belt' },
  { name: 'South Alabama', conference: 'Sun Belt' },
  { name: 'Southern Miss', conference: 'Sun Belt' },
  { name: 'Old Dominion', conference: 'Sun Belt' },
  { name: 'Texas State', conference: 'Sun Belt' },
  { name: 'UL Monroe', conference: 'Sun Belt' },

  // MAC (Mid-American Conference)
  { name: 'Toledo', conference: 'MAC' },
  { name: 'Miami (OH)', conference: 'MAC' },
  { name: 'Ohio', conference: 'MAC' },
  { name: 'Northern Illinois', conference: 'MAC' },
  { name: 'Western Michigan', conference: 'MAC' },
  { name: 'Central Michigan', conference: 'MAC' },
  { name: 'Eastern Michigan', conference: 'MAC' },
  { name: 'Ball State', conference: 'MAC' },
  { name: 'Bowling Green', conference: 'MAC' },
  { name: 'Buffalo', conference: 'MAC' },
  { name: 'Kent State', conference: 'MAC' },
  { name: 'Akron', conference: 'MAC' },

  // Conference USA
  { name: 'Liberty', conference: 'CUSA' },
  { name: 'Jacksonville State', conference: 'CUSA' },
  { name: 'New Mexico State', conference: 'CUSA' },
  { name: 'Western Kentucky', conference: 'CUSA' },
  { name: 'MTSU', conference: 'CUSA' },
  { name: 'Louisiana Tech', conference: 'CUSA' },
  { name: 'Sam Houston', conference: 'CUSA' },
  { name: 'Kennesaw State', conference: 'CUSA' },
  { name: 'UTEP', conference: 'CUSA' },
  { name: 'FIU', conference: 'CUSA' },
];

async function main() {
  console.log('Start seeding...');

  // Clear existing teams
  await prisma.team.deleteMany({});

  // Insert all teams
  for (const team of teams) {
    const createdTeam = await prisma.team.create({
      data: team,
    });
    console.log(`Created team: ${createdTeam.name} (${createdTeam.conference})`);
  }

  console.log(`Seeding finished. Created ${teams.length} teams.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
