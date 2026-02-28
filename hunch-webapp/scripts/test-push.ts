/**
 * Standalone script to test Expo push notifications
 * 
 * Usage:
 *   npx tsx scripts/test-push.ts <userId>
 * 
 * Example:
 *   npx tsx scripts/test-push.ts cm2abc123xyz
 * 
 * This script:
 * 1. Fetches a user by ID from the database
 * 2. Reads their expoPushToken
 * 3. Sends a test notification via Expo Push API
 * 4. Inspects the push ticket response
 * 5. Removes invalid tokens (DeviceNotRegistered)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import Expo, {
  ExpoPushMessage,
  ExpoPushTicket,
  ExpoPushSuccessTicket,
  ExpoPushErrorTicket,
} from 'expo-server-sdk';

// ─── Setup ──────────────────────────────────────────────────────

const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL or DIRECT_DATABASE_URL is not set');
  process.exit(1);
}

const isAccelerate = databaseUrl.startsWith('prisma://');

const prismaConfig: {
  log?: ('error' | 'warn')[];
  adapter?: PrismaPg;
  accelerateUrl?: string;
} = {
  log: ['error', 'warn'],
};

if (isAccelerate) {
  prismaConfig.accelerateUrl = databaseUrl;
} else {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  prismaConfig.adapter = adapter;
}

const prisma = new PrismaClient(prismaConfig);
const expo = new Expo();

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error('❌ Error: userId is required');
    console.log('\nUsage: npx tsx scripts/test-push.ts <userId>');
    process.exit(1);
  }

  console.log(`\n🔍 Looking up user: ${userId}`);

  // Fetch user from database
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        expoPushToken: true,
        tradeNotificationsEnabled: true,
      },
    });
  } catch (err) {
    console.error('❌ Database error:', err);
    process.exit(1);
  }

  if (!user) {
    console.error(`❌ User not found: ${userId}`);
    process.exit(1);
  }

  console.log('✅ User found:', {
    id: user.id,
    displayName: user.displayName || '(no display name)',
    tradeNotificationsEnabled: user.tradeNotificationsEnabled,
  });

  // Check if user has a push token
  if (!user.expoPushToken) {
    console.error('❌ User has no expoPushToken registered');
    console.log('\nTo register a token, POST to /api/users/push-token:');
    console.log('  { "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }');
    process.exit(1);
  }

  console.log('✅ Push token found:', user.expoPushToken);

  // Validate token format
  if (!Expo.isExpoPushToken(user.expoPushToken)) {
    console.error('❌ Invalid Expo push token format');
    process.exit(1);
  }

  // Build test notification
  const message: ExpoPushMessage = {
    to: user.expoPushToken,
    title: 'Hunch welcomes you!',
    body: 'Just Fking drop the Teaser Video',
    data: { type: 'TEST' },
    sound: 'default',
    channelId: 'test',
  };

  console.log('\n📤 Sending push notification...');
  console.log('Payload:', JSON.stringify(message, null, 2));

  // Send push notification
  let tickets: ExpoPushTicket[];
  try {
    tickets = await expo.sendPushNotificationsAsync([message]);
  } catch (err: any) {
    console.error('❌ Failed to send push notification:', err.message || err);
    process.exit(1);
  }

  console.log('\n📬 Received push ticket response:');

  // Inspect ticket
  const ticket = tickets[0];
  if (!ticket) {
    console.error('❌ No ticket returned from Expo');
    process.exit(1);
  }

  if (ticket.status === 'ok') {
    const successTicket = ticket as ExpoPushSuccessTicket;
    console.log('✅ Push notification sent successfully!');
    console.log('   Ticket ID:', successTicket.id);
    console.log('\n✨ Check your device for the notification.');
  } else {
    // ticket.status === 'error'
    const errorTicket = ticket as ExpoPushErrorTicket;
    console.error('❌ Push ticket error:');
    console.error('   Status:', errorTicket.status);
    console.error('   Message:', errorTicket.message);
    console.error('   Error code:', errorTicket.details?.error || 'N/A');

    // Handle DeviceNotRegistered
    if (errorTicket.details?.error === 'DeviceNotRegistered') {
      console.log('\n🧹 Token is no longer registered with Expo. Removing from database...');
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { expoPushToken: null },
        });
        console.log('✅ Token removed from database');
      } catch (err) {
        console.error('❌ Failed to remove token:', err);
      }
    }

    process.exit(1);
  }
}

// ─── Execute ────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error('\n💥 Unhandled error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
