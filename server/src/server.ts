import express, { Application } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { validateEnv } from './lib/env';
import { testDatabaseConnection, disconnectPrisma } from './lib/prisma';
import { initDraftSocket, setIOInstance } from './socket/draftSocket';

// Load environment variables FIRST
dotenv.config();

// Validate environment variables (fails fast if missing required vars)
const envConfig = validateEnv();

// Import routes
import authRoutes from './routes/auth';
import leagueRoutes from './routes/leagues';
import draftRoutes from './routes/draft';
import standingsRoutes from './routes/standings';
import adminRoutes from './routes/admin';
import rosterRoutes from './routes/rosters';
import cfbRoutes from './routes/cfb';
import oddsRoutes from './routes/odds';

const app: Application = express();
const httpServer = createServer(app);
const PORT = envConfig.PORT;

// Socket.IO setup with CORS. Auth is Bearer-token based (no cookies), so
// credentials are never needed — which keeps origin '*' legal in dev while
// production pins the exact client origin.
const io = new Server(httpServer, {
  cors: {
    origin: envConfig.CORS_ORIGIN === '*' ? true : envConfig.CORS_ORIGIN,
  },
});

// Initialize socket handlers and store IO instance
initDraftSocket(io);
setIOInstance(io);

// CORS configuration (Bearer-token auth — no cookies, no credentials flag)
const corsOptions = {
  origin: envConfig.CORS_ORIGIN,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pick 6 API is running', socketIO: true });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rosters', rosterRoutes);
app.use('/api/cfb', cfbRoutes);
app.use('/api/odds', oddsRoutes);

// Single-service deployment: serve the built client from the same origin
// (kills CORS and build-time API URLs entirely). The client build lives at
// ../client/dist relative to the repo; CLIENT_DIST overrides if needed.
const clientDist = process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback for deep links (/league/:id etc.) — API and health keep
  // falling through to the JSON 404 below
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`🖥️  Serving client from ${clientDist}`);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server with database connection test
async function startServer() {
  try {
    // Test database connection before starting server
    await testDatabaseConnection();

    httpServer.listen(PORT, () => {
      console.log(`🏈 Pick 6 server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API base: http://localhost:${PORT}/api`);
      console.log(`🔌 Socket.IO enabled for live draft`);
    });
  } catch (error: any) {
    console.error('\n❌ Server startup failed:');
    console.error(error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  io.close();
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  io.close();
  await disconnectPrisma();
  process.exit(0);
});

// Log unhandled promise rejections without dying — a single failed detached
// fetch (ESPN hiccup, odds timeout) must not take the whole server down
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Promise Rejection:', err);
});

// Start the server
startServer();

export { io };
export default app;
