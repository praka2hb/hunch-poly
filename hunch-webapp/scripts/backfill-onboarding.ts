/**
 * Backfill Script: Onboarding Fields for Existing Users
 *
 * Sets all existing users to:
 *   - walletReady = true  (they all have walletAddress since the field is required)
 *   - hasCompletedOnboarding = true
 *   - onboardingStep = COMPLETE
 *
 * This ensures existing users skip the new onboarding flow entirely.
 *
 * Usage:
 *   npx tsx scripts/backfill-onboarding.ts
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Manually read .env to get DIRECT_DATABASE_URL or DATABASE_URL
const envPath = path.resolve(__dirname, '../.env');
let databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const directMatch = envContent.match(/DIRECT_DATABASE_URL="?([^"\n]+)"?/);
    const dbMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
    if (directMatch) {
        databaseUrl = directMatch[1];
        console.log('Found DIRECT_DATABASE_URL in .env file');
    } else if (dbMatch) {
        databaseUrl = dbMatch[1];
        console.log('Found DATABASE_URL in .env file');
    }
}

if (databaseUrl) {
    databaseUrl = databaseUrl.trim();
}

if (!databaseUrl) {
    console.error('❌ Could not find DIRECT_DATABASE_URL or DATABASE_URL in environment or .env file');
    process.exit(1);
}

// Create Prisma Client configuration (adapter vs Accelerate)
const isAccelerate = databaseUrl.startsWith('prisma://');
const prismaConfig: { adapter?: any; accelerateUrl?: string } = {};

if (isAccelerate) {
    prismaConfig.accelerateUrl = databaseUrl;
} else {
    const pool = new Pool({ connectionString: databaseUrl });
    prismaConfig.adapter = new PrismaPg(pool);
}

const prisma = new PrismaClient(prismaConfig);

async function main() {
    try {
        console.log('🚀 Starting onboarding backfill...\n');

        // Count users that need backfill
        const total = await prisma.user.count({
            where: {
                OR: [
                    { hasCompletedOnboarding: false },
                    { walletReady: false },
                ],
            },
        });

        console.log(`📊 Found ${total} users to backfill.\n`);

        if (total === 0) {
            console.log('✅ Nothing to do — all users are already up to date.');
            return;
        }

        // Batch update all users
        const result = await prisma.user.updateMany({
            where: {
                OR: [
                    { hasCompletedOnboarding: false },
                    { walletReady: false },
                ],
            },
            data: {
                walletReady: true,
                hasCompletedOnboarding: true,
                onboardingStep: 'COMPLETE',
                onboardingUpdatedAt: new Date(),
            },
        });

        console.log(`✅ Backfilled ${result.count} users.`);
        console.log('   - walletReady = true');
        console.log('   - hasCompletedOnboarding = true');
        console.log('   - onboardingStep = COMPLETE');
        console.log('\n✨ Backfill complete!');
    } catch (error) {
        console.error('❌ Backfill failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
