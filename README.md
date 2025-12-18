# Pick 6 - College Football Fantasy League

Pick 6 is a fantasy college football application where users draft 6 college teams (not players) and compete based on weekly game outcomes. Simple, fast, and perfect for people who don't want to manage 15+ players.

## Features

- **Simple Drafting**: Pick 6 college teams and you're done
- **Private Leagues**: Create or join private leagues with unique join codes
- **Scheduled Drafts**: Commissioner sets draft date/time with countdown timer
- **Snake Draft**: Fair draft system that reverses order each round with timed picks and auto-pick
- **Draft Queue**: Pre-queue your picks so autopick selects your preferences
- **Auto-Start**: Drafts automatically begin when scheduled time arrives
- **My Leagues Dashboard**: View all your leagues with status, draft times, and records
- **Dynamic Scoring**:
  - Win = +1 point
  - Loss = 0 points
  - Upset Win (underdog) = +2 points
  - Upset Loss (favorite) = -1 point
- **Automated Scoring**: Real scores fetched from ESPN, odds from The Odds API
- **Live Matchups**: View your teams' upcoming games with odds and game times
- **Smart Caching**: API responses cached to optimize performance and protect rate limits
- **Roster Management**: View all rosters in your league
- **Waiver Wire**: ESPN-style waiver claims with priority based on standings
- **Free Agency**: Instant pickups after waiver period
- **FAAB Auction**: Midseason blind auction system with virtual currency
  - One auction window per season (commissioner configurable)
  - Blind bidding - high bid amount shown but bidder hidden
  - Kickoff locks - can't bid on teams whose games have started
  - Budget management - $100 default FAAB budget per user
- **Real-time Updates**: Live draft board, auction, and standings updates
- **Mobile Responsive**: Works seamlessly on desktop and mobile

## How Scoring Works

Pick 6 uses a two-tier scoring system that rewards both consistency and upsets:

### Automated Scoring Flow

1. **Game Data**: ESPN's hidden API fetches real college football scores
2. **Odds Data**: The Odds API provides pre-game spreads to identify favorites
3. **Upset Detection**: When an underdog wins, it's automatically flagged as an upset
4. **Score Calculation**: Points are awarded based on win/loss and upset status

### Point Values

| Result | Points | Description |
|--------|--------|-------------|
| Regular Win | +1 | Your team wins as expected |
| Upset Win | +2 | Your underdog team beats a favorite |
| Regular Loss | 0 | Your team loses as expected |
| Upset Loss | -1 | Your favored team loses to an underdog |

This creates strategic depth: picking heavy favorites is safe but limits upside, while underdogs carry risk but offer bigger rewards.

## FAAB Auction System

The FAAB (Free Agent Acquisition Budget) Auction is a midseason roster management feature that allows all league members to bid on available teams using virtual currency.

### How It Works

1. **Commissioner Setup**: The commissioner creates a single auction event with:
   - Week number (e.g., Week 7)
   - Open time (when bidding starts)
   - Close time (when bidding ends)

2. **Bidding Period**:
   - All members start with $100 FAAB budget
   - Place bids on any available (not rostered) team
   - Each bid requires specifying a team to drop (rosters stay at 6)
   - High bid amounts are shown, but bidder identity is hidden
   - You can update or cancel your bids anytime while auction is open

3. **Kickoff Locks**:
   - Teams whose games start before the auction closes are LOCKED
   - This prevents gaming the system by bidding on teams mid-game
   - If kickoff time can't be determined, team is conservatively locked

4. **Finalization**:
   - When auction closes, highest bid wins each team
   - Ties go to earliest bid
   - Winning bid amount is deducted from winner's budget
   - Rosters are updated (drop team removed, won team added)
   - Winners are revealed to all members

### FAAB Rules

| Rule | Value | Notes |
|------|-------|-------|
| Starting Budget | $100 | Configurable per league |
| Min Bid | $0 | Free bids allowed |
| Roster Size | 6 | Teams per user |
| Auction Events | 1 | One midseason auction per league |
| Bid Type | Blind | Others see high bid, not bidder |

### Testing the Auction

```bash
cd server
npx tsx scripts/test-auction.ts
```

This creates a test scenario with conflicting bids and verifies the finalization logic.

## Tech Stack

### Frontend
- React 18+ with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Router for navigation
- Axios for API calls

### Backend
- Node.js with Express
- TypeScript
- PostgreSQL database
- Prisma ORM
- JWT authentication
- bcrypt for password hashing

### External APIs
- **ESPN API** (hidden/unofficial): Game scores and schedules
- **The Odds API**: Pre-game spreads for upset detection

## Project Structure

```
pick6/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components (DraftTab, RosterTab, WaiverTab, etc.)
│   │   ├── pages/         # Page components (Landing, MainApp, LeagueSetup)
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── services/      # API service layer
│   │   └── types/         # TypeScript types
├── server/                 # Express backend
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── middleware/    # Auth, error handling
│   │   ├── routes/        # API routes
│   │   ├── services/      # ESPN client, Odds client, sync service
│   │   ├── lib/           # Prisma client, env validation
│   │   └── types/         # TypeScript types
│   ├── prisma/
│   │   ├── schema.prisma  # Database schema
│   │   └── seed.ts        # Team seeding with ESPN IDs
│   └── scripts/
│       └── integration-test.ts
├── docker-compose.yml      # Local PostgreSQL setup
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Docker (recommended for local Postgres) or PostgreSQL (v14 or higher)
- npm or yarn

### Quick Start with Docker (Recommended)

1. **Clone and start the database**
   ```bash
   cd Pick6
   docker compose up -d
   ```
   Note: If using older Docker, use `docker-compose up -d` instead.

2. **Set up the server**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # .env already configured for local Docker postgres

   npm run prisma:generate
   npm run prisma:migrate dev
   npm run prisma:seed
   ```

3. **Set up the client**
   ```bash
   cd ../client
   npm install
   ```

4. **Run the app**
   ```bash
   # Terminal 1 (server)
   cd server && npm run dev

   # Terminal 2 (client)
   cd client && npm run dev
   ```

5. Open http://localhost:3000

### Manual PostgreSQL Setup

If not using Docker:

```bash
createdb pick6
cd server
cp .env.example .env
# Edit .env: DATABASE_URL=postgresql://user:password@localhost:5432/pick6
```

Then follow steps 2-4 above.

## Environment Variables

### Server (.env)

```bash
# Required
DATABASE_URL=postgresql://pick6:pick6local@localhost:5432/pick6
JWT_SECRET=pick6-super-secret-jwt-key-change-in-production

# Optional (with defaults)
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*

# External APIs (required for automated scoring)
ODDS_API_KEY=your-api-key-from-the-odds-api.com
ESPN_GROUP_ID=80  # 80 = FBS Division I
```

### Getting an Odds API Key

1. Sign up at https://the-odds-api.com/
2. Get your free API key (500 requests/month free tier)
3. Add to your `.env` file

Without an ODDS_API_KEY, the app will still work but won't automatically detect upsets.

### API Caching

To protect rate limits and improve performance, the app caches external API responses:

| API Endpoint | Cache TTL | Purpose |
|--------------|-----------|---------|
| ESPN Scoreboard | 60 seconds | Live game scores |
| ESPN Schedule | 5 minutes | Weekly schedule |
| Odds API | 15 minutes | Pre-game spreads and odds |
| Team Matchups | 5 minutes | Combined roster + game data |

The Odds API has a 500 requests/month free tier limit. With 15-minute caching, you can safely make ~2,880 cached requests without hitting the underlying API more than necessary.

### Client (.env)

```bash
VITE_API_URL=http://localhost:3001  # Only needed in production
```

## API Endpoints

### Auth Routes (`/api/auth`)
- `POST /register` - Create new user
- `POST /login` - Login user
- `GET /me` - Get current user (protected)

### League Routes (`/api/leagues`)
- `GET /my` - Get all leagues for current user (My Leagues dashboard)
- `POST /create` - Create new league
- `POST /join` - Join existing league
- `GET /:leagueId` - Get league details
- `GET /:leagueId/members` - Get all members
- `PATCH /:leagueId/settings` - Update league settings (commissioner only)

### Draft Routes (`/api/draft`)
- `GET /teams` - Get all teams
- `POST /:leagueId/start` - Start the draft
- `GET /:leagueId/state` - Get current draft state
- `POST /:leagueId/pick` - Draft a team
- `POST /:leagueId/autopick` - Trigger autopick
- `GET /:leagueId/queue` - Get user's draft queue
- `PUT /:leagueId/queue` - Set draft queue
- `GET /:leagueId/available` - Get available teams

### Roster Routes (`/api/rosters`)
- `GET /:leagueId` - Get all rosters
- `GET /:leagueId/my` - Get current user's roster
- `GET /:leagueId/available` - Get available free agents
- `GET /:leagueId/waiver-priority` - Get waiver order
- `POST /:leagueId/waivers` - Submit waiver claim
- `DELETE /:leagueId/waivers/:claimId` - Cancel claim
- `POST /:leagueId/waivers/process` - Process waivers (admin)
- `POST /:leagueId/free-agent` - Add free agent
- `GET /:leagueId/matchups` - Get current user's team matchups with ESPN/Odds data
- `GET /:leagueId/matchups/all` - Get all rosters with matchups

### Auction Routes (`/api/auction`)
- `GET /:leagueId` - Get auction state (status, timing, budgets, high bids)
- `POST /:leagueId/create` - Create auction event (commissioner only)
- `DELETE /:leagueId` - Delete auction (commissioner only, before start)
- `POST /:leagueId/open` - Manually open auction
- `POST /:leagueId/bid` - Place a bid (addTeamId, dropTeamId, amount)
- `POST /:leagueId/cancel-bid` - Cancel a bid
- `POST /:leagueId/finalize` - Finalize auction and process winners
- `GET /:leagueId/available-teams` - Get available teams with kickoff lock status
- `GET /:leagueId/high-bids` - Get current high bids (anonymous)
- `GET /:leagueId/my-bids` - Get user's bids
- `GET /:leagueId/my-roster` - Get user's roster for drop selection

### CFB Routes (`/api/cfb`)
- `GET /scoreboard` - Get live ESPN scoreboard (cached 60s)
- `GET /schedule` - Get weekly schedule (cached 5min)
- `GET /game/:eventId` - Get specific game details

### Odds Routes (`/api/odds`)
- `GET /ncaaf` - Get all NCAAF odds (cached 15min)
- `GET /ncaaf/game/:homeTeam/:awayTeam` - Get odds for specific game
- `GET /status` - Check Odds API status and remaining requests

### Standings Routes (`/api/standings`)
- `GET /:leagueId/week/:weekNumber` - Get weekly standings
- `GET /:leagueId/overall` - Get overall standings

### Admin Routes (`/api/admin`)

#### Automated Scoring (New!)
- `POST /sync-week/:leagueId/:weekNumber` - Full sync: ESPN games + odds + scores
- `POST /sync-games/:seasonYear/:weekNumber` - Sync games from ESPN
- `POST /sync-odds` - Sync current odds
- `POST /finalize-games/:seasonYear/:weekNumber` - Finalize and detect upsets
- `GET /espn-games/:seasonYear/:weekNumber` - Preview ESPN data
- `GET /current-odds` - Preview current odds
- `GET /games/:seasonYear/:weekNumber` - Get synced games

#### Manual Entry (Legacy)
- `POST /game-result` - Enter game result manually
- `POST /calculate-scores/:leagueId/:weekNumber` - Calculate scores manually
- `GET /game-results/:weekNumber` - Get manual game results

### Sync a Week's Scores

To update all scores for a week:

```bash
# Full automated sync
curl -X POST http://localhost:3001/api/admin/sync-week/1/5 \
  -H "Authorization: Bearer <token>"

# Or step by step:
# 1. Sync games from ESPN
curl -X POST http://localhost:3001/api/admin/sync-games/2024/5 \
  -H "Authorization: Bearer <token>"

# 2. Sync odds (run before games start)
curl -X POST http://localhost:3001/api/admin/sync-odds \
  -H "Authorization: Bearer <token>"

# 3. After games finish, finalize and detect upsets
curl -X POST http://localhost:3001/api/admin/finalize-games/2024/5 \
  -H "Authorization: Bearer <token>"
```

## Database Schema

Key models (see [server/prisma/schema.prisma](server/prisma/schema.prisma)):

- **User**: User accounts
- **League**: League settings, draft state, current week
- **LeagueMember**: User-league relationships with draft position
- **Team**: 130 FBS teams with ESPN IDs and abbreviations
- **DraftPick**: Draft selections with auto-pick tracking
- **DraftQueue**: User's pre-draft preferences
- **Game**: ESPN game data with scores, odds, upset flags
- **GameResult**: Legacy manual game entry
- **RosterTeam**: Team ownership with acquisition tracking (DRAFT, WAIVER, FREE_AGENT, AUCTION)
- **WaiverClaim**: Pending/processed waiver requests
- **WeeklyScore**: Point totals per user per week
- **AuctionEvent**: FAAB auction configuration and status
- **AuctionBid**: Individual bids with status tracking

## Running Tests

```bash
cd server
npx tsx scripts/integration-test.ts
```

This tests:
- User creation
- League creation and joining
- Full snake draft simulation
- Mock game sync
- Score calculation
- Standings generation
- Waiver claim submission

## Available Scripts

### Server
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run migrations
- `npm run prisma:seed` - Seed teams

### Client
- `npm run dev` - Start development server
- `npm run build` - Build for production

## Troubleshooting

### "Tenant or user not found" Database Error

This means the database connection failed. Common causes:
- Database not running: `docker-compose up -d`
- Wrong credentials: Check DATABASE_URL in `.env`
- Database doesn't exist: Run migrations

### Environment Validation Fails

The server now validates required env vars at startup:
```
❌ Environment validation failed:
   - DATABASE_URL is required
   - JWT_SECRET is required
```

Create a `.env` file from `.env.example`.

### ESPN API Returns Empty

- Check the week number is valid for the season
- ESPN group ID 80 is for FBS; adjust if needed
- Games may not be available until close to kickoff

### Odds API Errors

- Verify your API key is set in ODDS_API_KEY
- Free tier has 500 requests/month limit
- NCAAF odds only available during season

### Port Conflicts

Change ports in:
- `server/.env`: `PORT=3001`
- `client/.env`: `VITE_API_URL`
- `client/vite.config.ts`: proxy target

## Production Deployment

1. **Set production environment variables**
   ```bash
   DATABASE_URL=postgresql://... (production DB)
   JWT_SECRET=<long-random-string>
   NODE_ENV=production
   CORS_ORIGIN=https://your-frontend.com
   ODDS_API_KEY=<your-key>
   ```

2. **Build and deploy**
   ```bash
   # Client
   cd client && npm run build
   # Deploy dist/ to Vercel, Netlify, etc.

   # Server
   cd server && npm run build
   # Deploy to Railway, Render, Fly.io, etc.
   ```

3. **Run migrations on production**
   ```bash
   npm run prisma:migrate deploy
   npm run prisma:seed
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

---

**Ready to play?** Pick 6 teams and watch them win. That's it.
