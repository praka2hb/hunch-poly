import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Check if using Prisma Accelerate (URL starts with "prisma://")
const databaseUrl = process.env.DIRECT_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const isAccelerate = databaseUrl.startsWith('prisma://');

// Create Prisma Client configuration
const prismaConfig: {
  log?: ('error' | 'warn')[];
  adapter?: PrismaPg;
  accelerateUrl?: string;
} = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
};

if (isAccelerate) {
  // When using Accelerate, provide the accelerateUrl
  prismaConfig.accelerateUrl = databaseUrl;
} else {
  // Otherwise, use adapter with connection pool
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  prismaConfig.adapter = adapter;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(prismaConfig);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

