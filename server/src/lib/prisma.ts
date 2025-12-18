import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient instance with connection error handling
let prisma: PrismaClient;

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

  return client;
}

// Get or create the singleton instance
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

// Test database connection with actionable error messages
export async function testDatabaseConnection(): Promise<void> {
  const client = getPrismaClient();

  try {
    // Simple query to test connection
    await client.$queryRaw`SELECT 1`;
    console.log('✅ Database connection established successfully');
  } catch (error: any) {
    const errorMessage = error.message || String(error);

    // Parse common Prisma/PostgreSQL errors and provide actionable messages
    if (errorMessage.includes('Tenant or user not found')) {
      throw new Error(
        `Database connection failed: Invalid database host or tenant.\n` +
        `  - If using Supabase: Check that your project still exists and DATABASE_URL is correct\n` +
        `  - If using local Postgres: Run 'docker-compose up -d' and update DATABASE_URL\n` +
        `  Current DATABASE_URL host: ${getDatabaseHost()}`
      );
    }

    if (errorMessage.includes('password authentication failed')) {
      throw new Error(
        `Database connection failed: Invalid credentials.\n` +
        `  - Check POSTGRES_PASSWORD matches your database\n` +
        `  - For local development: docker-compose down -v && docker-compose up -d`
      );
    }

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused')) {
      throw new Error(
        `Database connection failed: Cannot connect to database server.\n` +
        `  - For local Postgres: Run 'docker-compose up -d'\n` +
        `  - For remote database: Check host/port in DATABASE_URL\n` +
        `  Current DATABASE_URL host: ${getDatabaseHost()}`
      );
    }

    if (errorMessage.includes('database') && errorMessage.includes('does not exist')) {
      throw new Error(
        `Database connection failed: Database does not exist.\n` +
        `  - Run 'npx prisma migrate deploy' to create the database schema\n` +
        `  - Or check DATABASE_URL points to the correct database name`
      );
    }

    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      throw new Error(
        `Database connection failed: Connection timed out.\n` +
        `  - Check network connectivity to database host\n` +
        `  - Verify firewall rules allow connection\n` +
        `  Current DATABASE_URL host: ${getDatabaseHost()}`
      );
    }

    // Generic error with original message
    throw new Error(
      `Database connection failed: ${errorMessage}\n` +
      `  - Check DATABASE_URL environment variable is set correctly\n` +
      `  - For local development: Run 'docker-compose up -d'`
    );
  }
}

// Helper to extract host from DATABASE_URL for error messages
function getDatabaseHost(): string {
  try {
    const url = process.env.DATABASE_URL || '';
    const match = url.match(/@([^:\/]+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

// Graceful shutdown
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    console.log('Database connection closed');
  }
}

// Export singleton instance
export default getPrismaClient();
