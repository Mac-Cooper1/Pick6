import express, { Application } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { validateEnv } from './lib/env';
import { testDatabaseConnection, disconnectPrisma } from './lib/prisma';
import { initDraftSocket, setIOInstance } from './socket/draftSocket';
import { initAuctionSocket } from './socket/auctionSocket';

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
import auctionRoutes from './routes/auction';

const app: Application = express();
const httpServer = createServer(app);
const PORT = envConfig.PORT;

// Socket.IO setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: envConfig.CORS_ORIGIN === '*' ? true : envConfig.CORS_ORIGIN,
    credentials: true,
  },
});

// Initialize socket handlers and store IO instance
initDraftSocket(io);
initAuctionSocket(io);
setIOInstance(io);

// CORS configuration
const corsOptions = {
  origin: envConfig.CORS_ORIGIN,
  credentials: true,
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
app.use('/api/auction', auctionRoutes);

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
      console.log(`🔌 Socket.IO enabled for live draft and auction`);
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Start the server
startServer();

export { io };
export default app;
