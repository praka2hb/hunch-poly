import { Client } from '@upstash/qstash';

// Initialize QStash client
const qstashClient = new Client({
    token: process.env.QSTASH_TOKEN!,
});

/**
 * Publish a copy trade job to QStash
 * This is called after a leader places a trade to fan out to followers
 */
export async function publishCopyTradeJob(leaderTradeId: string, followerId: string) {
    const copyExecuteUrl = process.env.COPY_EXECUTE_URL;

    if (!copyExecuteUrl) {
        console.error('COPY_EXECUTE_URL not configured, skipping copy trade job');
        return null;
    }

    try {
        const response = await qstashClient.publishJSON({
            url: copyExecuteUrl,
            body: {
                leaderTradeId,
                followerId,
            },
            delay: 5, // 5 second delay
            retries: 3,
        });

        console.log(`[QStash] Enqueued copy job for follower ${followerId}, messageId: ${response.messageId}`);
        return response;
    } catch (error) {
        console.error(`[QStash] Failed to enqueue copy job for follower ${followerId}:`, error);
        // Don't throw - we don't want to fail the leader's trade
        return null;
    }
}

export { qstashClient };
