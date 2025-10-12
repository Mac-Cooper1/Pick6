# Pick 6 - College Football Fantasy League

Pick 6 is a fantasy college football application where users draft 6 college teams (not players) and compete based on weekly game outcomes. Simple, fast, and perfect for people who don't want to manage 15+ players.

## Features

- **Simple Drafting**: Pick 6 college teams and you're done
- **Private Leagues**: Create or join private leagues with unique join codes
- **Snake Draft**: Fair draft system that reverses order each round
- **Dynamic Scoring**:
  - Win = +1 point
  - Loss = 0 points
  - Upset Win (underdog) = +2 points
  - Upset Loss (favorite) = -1 point
- **Real-time Updates**: Live draft board and standings updates
- **Mobile Responsive**: Works seamlessly on desktop and mobile

## Tech Stack

### Frontend
- React 18+ with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Router for navigation
- Axios for API calls
- React Query for data fetching/caching

### Backend
- Node.js with Express
- TypeScript
- PostgreSQL database
- Prisma ORM
- JWT authentication
- bcrypt for password hashing

## Project Structure

```
pick6/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── services/      # API service layer
│   │   ├── types/         # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/                # Express backend
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── middleware/    # Auth, error handling
│   │   ├── routes/        # API routes
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Helper functions
│   │   └── server.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   cd Pick6
   ```

2. **Set up PostgreSQL database**
   ```bash
   # Create a PostgreSQL database named 'pick6'
   createdb pick6

   # Or using psql:
   psql -U postgres
   CREATE DATABASE pick6;
   ```

3. **Set up the server**
   ```bash
   cd server
   npm install

   # Copy environment file and update DATABASE_URL
   cp .env.example .env
   # Edit .env and update DATABASE_URL with your PostgreSQL credentials

   # Run Prisma migrations
   npm run prisma:generate
   npm run prisma:migrate

   # Seed the database with college teams
   npm run prisma:seed
   ```

4. **Set up the client**
   ```bash
   cd ../client
   npm install

   # Copy environment file
   cp .env.example .env
   ```

### Running the Application

1. **Start the server** (from server directory)
   ```bash
   cd server
   npm run dev
   ```
   Server will run on http://localhost:3001

2. **Start the client** (from client directory, in a new terminal)
   ```bash
   cd client
   npm run dev
   ```
   Client will run on http://localhost:3000

3. **Open your browser**
   Navigate to http://localhost:3000

## Usage Guide

### Creating a League

1. Sign up or sign in with your name and email
2. Click "Create League"
3. Enter league name, select max players (8-12), and set a password
4. Optionally set a custom join code (6 characters)
5. Share the join code and password with friends

### Joining a League

1. Sign up or sign in
2. Click "Join League"
3. Enter the join code and password provided by the league creator

### Drafting Teams

1. Navigate to the "Draft" tab
2. Use the search box to find teams
3. Click "Draft" to select a team
4. The draft follows a snake order (1→N, N→1, 1→N, etc.)
5. Each player drafts 6 teams total

### Viewing Standings

1. Navigate to the "Standings" tab
2. View weekly standings and overall season standings
3. Use arrows to navigate between weeks

## Admin Functions (MVP)

For the MVP, game results and scoring are manual:

### Entering Game Results

Use API endpoint or tools like Postman/Insomnia:

```bash
POST http://localhost:3001/api/admin/game-result
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "teamId": 1,
  "weekNumber": 5,
  "opponent": "LSU",
  "result": "win",
  "wasUpset": true,
  "gameDate": "2024-10-12T19:00:00Z"
}
```

### Calculating Weekly Scores

After entering all game results for a week:

```bash
POST http://localhost:3001/api/admin/calculate-scores/:leagueId/:weekNumber
Authorization: Bearer <your-jwt-token>
```

Example:
```bash
POST http://localhost:3001/api/admin/calculate-scores/1/5
```

## API Endpoints

### Auth Routes (`/api/auth`)
- `POST /register` - Create new user
- `POST /login` - Login user
- `GET /me` - Get current user (protected)

### League Routes (`/api/leagues`)
- `POST /create` - Create new league (protected)
- `POST /join` - Join existing league (protected)
- `GET /:leagueId` - Get league details (protected)
- `GET /:leagueId/members` - Get all members (protected)

### Draft Routes (`/api/draft`)
- `GET /teams` - Get all teams (protected)
- `GET /:leagueId/picks` - Get draft picks (protected)
- `POST /:leagueId/pick` - Draft a team (protected)
- `GET /:leagueId/available` - Get available teams (protected)

### Standings Routes (`/api/standings`)
- `GET /:leagueId/week/:weekNumber` - Get weekly standings (protected)
- `GET /:leagueId/overall` - Get overall standings (protected)

### Admin Routes (`/api/admin`)
- `POST /game-result` - Enter game result (protected)
- `POST /calculate-scores/:leagueId/:weekNumber` - Calculate scores (protected)
- `GET /game-results/:weekNumber` - Get game results (protected)

## Database Schema

The application uses PostgreSQL with Prisma ORM. Key models:

- **User**: User accounts
- **League**: League information
- **LeagueMember**: User-league relationships
- **Team**: College football teams (130 FBS teams)
- **DraftPick**: Draft selections
- **WeeklyScore**: Weekly point totals
- **GameResult**: Game outcomes and points

See [server/prisma/schema.prisma](server/prisma/schema.prisma) for the complete schema.

## Available Scripts

### Server
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:seed` - Seed database with teams
- `npm run prisma:studio` - Open Prisma Studio

### Client
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Environment Variables

### Server (`.env`)
```
DATABASE_URL=postgresql://user:password@localhost:5432/pick6
JWT_SECRET=your-secret-key-change-in-production
PORT=3001
NODE_ENV=development
```

### Client (`.env`)
```
VITE_API_URL=http://localhost:3001
```

## Production Deployment

### Preparing for Production

1. **Update environment variables**
   - Generate a strong JWT_SECRET
   - Update DATABASE_URL to production database
   - Set NODE_ENV=production

2. **Build the client**
   ```bash
   cd client
   npm run build
   ```

3. **Build the server**
   ```bash
   cd server
   npm run build
   ```

4. **Run migrations on production database**
   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```

### Deployment Options

- **Frontend**: Vercel, Netlify, or any static hosting
- **Backend**: Railway, Render, Heroku, or any Node.js hosting
- **Database**: Supabase, Railway, Render, or any PostgreSQL hosting

## Future Enhancements

Features not included in MVP but planned for future releases:

- Live score integration from sports APIs
- Automated upset detection via odds APIs
- Real-time draft synchronization with WebSockets
- Email notifications
- Password reset flows
- User profiles and avatars
- Multiple leagues per user
- Trade system
- Chat/messaging
- Mobile apps (iOS/Android)

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL in `.env`
- Ensure database exists: `psql -l`

### Port Already in Use
- Change PORT in server `.env`
- Update VITE_API_URL in client `.env`
- Update proxy in client `vite.config.ts`

### Prisma Issues
```bash
# Reset database and reseed
cd server
npm run db:reset
npm run prisma:seed
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Contact

For questions or support, please open an issue on GitHub.

---

**Ready to play?** Pick 6 teams and watch them win. That's it.
