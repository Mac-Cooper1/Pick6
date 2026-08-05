/**
 * Environment variable validation
 * Fails fast at boot if required variables are missing
 */

interface EnvConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  CORS_ORIGIN: string;
  ODDS_API_KEY?: string;
  ADMIN_SECRET?: string;
  ESPN_GROUP_ID: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
      `  Please check your .env file or environment configuration.\n` +
      `  See .env.example for required variables.`
    );
  }
  return value;
}

function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function validateEnv(): EnvConfig {
  console.log('🔧 Validating environment variables...');

  const errors: string[] = [];

  // Required variables
  const DATABASE_URL = process.env.DATABASE_URL;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!DATABASE_URL) {
    errors.push('DATABASE_URL is required - set your PostgreSQL connection string');
  }

  if (!JWT_SECRET) {
    errors.push('JWT_SECRET is required - set a secure random string for JWT signing');
  }

  // Warn about insecure defaults
  if (JWT_SECRET === 'pick6-super-secret-jwt-key-change-in-production') {
    console.warn('⚠️  WARNING: Using default JWT_SECRET. Change this in production!');
  }

  // Fail fast if required vars missing
  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:');
    errors.forEach(err => console.error(`   - ${err}`));
    console.error('\nCreate a .env file based on .env.example or set these environment variables.\n');
    process.exit(1);
  }

  // Optional variables with defaults
  const PORT = parseInt(getOptionalEnv('PORT', '3001'), 10);
  const NODE_ENV = getOptionalEnv('NODE_ENV', 'development') as EnvConfig['NODE_ENV'];
  const CORS_ORIGIN = getOptionalEnv('CORS_ORIGIN', '*');
  const ODDS_API_KEY = process.env.ODDS_API_KEY;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const ESPN_GROUP_ID = getOptionalEnv('ESPN_GROUP_ID', '80'); // 80 = FBS

  // Warn about optional but recommended vars
  if (!ODDS_API_KEY) {
    console.warn('⚠️  ODDS_API_KEY not set - upset detection will not work automatically');
  }

  if (!ADMIN_SECRET && NODE_ENV === 'production') {
    console.warn('⚠️  ADMIN_SECRET not set - scheduled syncs (GitHub Actions) cannot authenticate');
  }

  console.log('✅ Environment variables validated');

  return {
    DATABASE_URL: DATABASE_URL!,
    JWT_SECRET: JWT_SECRET!,
    PORT,
    NODE_ENV,
    CORS_ORIGIN,
    ODDS_API_KEY,
    ADMIN_SECRET,
    ESPN_GROUP_ID,
  };
}

// Export validated config singleton
let config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!config) {
    config = validateEnv();
  }
  return config;
}
