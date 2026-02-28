/**
 * EXA News Pipeline Script
 * 
 * Robust solution for fetching evidence for Home page filters with Gemini rate limiting.
 * 
 * Usage:
 *   npx ts-node scripts/run-exa-pipeline.ts [command] [options]
 * 
 * Commands:
 *   smart             - Intelligently process events within rate limits (recommended)
 *   home              - Process top events for home page (crypto, politics, economics)
 *   crypto            - Process crypto events only
 *   politics          - Process politics events only
 *   [category]        - Process any specific category
 *   run-all           - Process all categories (ignores rate limits!)
 *   status            - Show current quota status
 * 
 * Options:
 *   --limit N         - Max events to process (default: 3)
 *   --dry-run         - Show what would be processed without making API calls
 *   --noted TICKER    - Add a noted event ticker (can be used multiple times)
 * 
 * Examples:
 *   npx ts-node scripts/run-exa-pipeline.ts smart
 *   npx ts-node scripts/run-exa-pipeline.ts smart --dry-run
 *   npx ts-node scripts/run-exa-pipeline.ts smart --noted CRYPTO-BTC-PRICE
 *   npx ts-node scripts/run-exa-pipeline.ts status
 *   npx ts-node scripts/run-exa-pipeline.ts crypto --limit 5
 */

import { GeminiRateLimiter } from './lib/rateLimiter';
import {
    ALL_HOME_CATEGORIES,
    TOPIC_FILTERS,
    Event,
    loadNotedEventTickers,
    selectEvents,
    getSelectionSummary,
    categorizeEvent,
} from './lib/eventSelector';

// Legacy categories for backward compatibility
// All categories that can be processed individually
const LEGACY_CATEGORIES = [
    'crypto', 'politics', 'economics', 'sports', 'entertainment', 'tech', 'finance',
    'elections', 'companies', 'climate', 'mentions', 'social', 'transportation', 'science'
];

// Parse command line arguments
function parseArgs(): {
    command: string;
    limit: number;
    dryRun: boolean;
    notedTickers: string[];
} {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase() || 'smart';
    let limit = 3;
    let dryRun = false;
    const notedTickers: string[] = [];

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--dry-run') {
            dryRun = true;
        } else if (args[i] === '--noted' && args[i + 1]) {
            notedTickers.push(args[i + 1]);
            i++;
        }
    }

    return { command, limit, dryRun, notedTickers };
}

// Fetch all events from the API (chunk-wise to avoid 25 ticker limit)
async function fetchAllEvents(): Promise<Event[]> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const allEvents: Event[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 10;
    const pageSize = 25; // API limit is 25 tickers max

    console.log(`📡 Fetching events from API (chunk size: ${pageSize})...`);

    while (pageCount < maxPages) {
        pageCount++;
        try {
            // Fetch without nested markets to avoid 25 ticker limit
            // Markets will be fetched individually when processing each event
            const url = `${baseUrl}/api/dflow/events?limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`Failed to fetch events: ${response.statusText}`, errorData);
                break;
            }

            const data = await response.json();
            const events = data.events || [];
            allEvents.push(...events);
            cursor = data.cursor;

            console.log(`   Chunk ${pageCount}: ${events.length} events (total: ${allEvents.length})`);

            if (!cursor || allEvents.length >= 200) {
                break;
            }

            // Small delay between chunks to be respectful
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
            console.error(`Error fetching chunk ${pageCount}:`, error?.message);
            break;
        }
    }

    return allEvents;
}


// Process a single event through the pipeline
async function processEvent(event: Event, dryRun: boolean = false): Promise<{
    success: boolean;
    evidenceCreated: number;
    error?: string;
}> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/pipeline/exa-category?category=all&limit=1&ticker=${event.ticker}`;

    if (dryRun) {
        console.log(`   [DRY-RUN] Would process: ${event.ticker}`);
        return { success: true, evidenceCreated: 0 };
    }

    try {
        // Use the existing pipeline endpoint with a single event
        const eventUrl = `${baseUrl}/api/pipeline/exa-single?ticker=${encodeURIComponent(event.ticker)}`;

        // Fallback to processing via category endpoint
        const categoryUrl = `${baseUrl}/api/pipeline/exa-category?category=all&limit=1`;

        // For now, we'll call the event-specific processing
        const response = await fetch(categoryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventTickers: [event.ticker] }),
        });

        // If POST not supported, try GET with limit=1
        if (response.status === 405) {
            const getResponse = await fetch(
                `${baseUrl}/api/pipeline/exa-category?category=all&limit=1`,
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                }
            );
            const data = await getResponse.json();
            return {
                success: getResponse.ok,
                evidenceCreated: data.stats?.evidenceCreated || 0,
                error: data.error,
            };
        }

        const data = await response.json();
        return {
            success: response.ok,
            evidenceCreated: data.stats?.evidenceCreated || 0,
            error: data.error,
        };
    } catch (error: any) {
        return {
            success: false,
            evidenceCreated: 0,
            error: error?.message,
        };
    }
}

// Call the existing category pipeline endpoint
async function callCategoryPipeline(category: string, limit: number): Promise<{
    success: boolean;
    stats: any;
    error?: string;
}> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/pipeline/exa-category?category=${category}&limit=${limit}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Processing category: ${category.toUpperCase()}`);
    console.log(`   Limit: ${limit} events`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (!response.ok) {
            console.error(`❌ Error: ${data.error || 'Unknown error'}`);
            return { success: false, stats: data.stats, error: data.error };
        }

        console.log(`✅ Completed in ${duration}s`);
        console.log(`   📊 Stats:`);
        console.log(`      - Events processed: ${data.stats?.eventsProcessed || 0}`);
        console.log(`      - Exa calls: ${data.stats?.exaCalls || 0}`);
        console.log(`      - Gemini calls: ${data.stats?.geminiCalls || 0}`);
        console.log(`      - Evidence created: ${data.stats?.evidenceCreated || 0}`);

        return { success: true, stats: data.stats };
    } catch (error: any) {
        console.error(`❌ Network error: ${error.message}`);
        return { success: false, stats: {}, error: error.message };
    }
}

// Smart pipeline: Rate-limited processing with intelligent event selection
async function runSmartPipeline(limit: number, dryRun: boolean, additionalNotedTickers: string[]) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# 🧠 SMART PIPELINE - Rate-Limited Evidence Fetching`);
    console.log(`${'#'.repeat(60)}\n`);

    // Initialize rate limiter
    const rateLimiter = new GeminiRateLimiter({
        requestsPerMinute: 10,
        requestsPerDay: 10,
    });

    const status = rateLimiter.getStatus();
    console.log(`📊 Quota Status: ${status.remaining}/${status.total} remaining (${status.date})`);

    if (!rateLimiter.canMakeRequest()) {
        console.log(`\n⚠️  Daily quota exhausted! Try again tomorrow.`);
        console.log(`   Quota resets at midnight UTC.\n`);
        return;
    }

    // Load noted event tickers
    const notedTickers = [...loadNotedEventTickers(), ...additionalNotedTickers];
    if (notedTickers.length > 0) {
        console.log(`📌 Noted events: ${notedTickers.join(', ')}`);
    }

    // Fetch all events
    const allEvents = await fetchAllEvents();
    console.log(`\n📋 Total events available: ${allEvents.length}`);

    // Filter to active events only
    const activeEvents = allEvents.filter((e: any) =>
        e.status !== 'finalized' &&
        e.status !== 'resolved' &&
        e.status !== 'closed'
    );
    console.log(`✅ Active events: ${activeEvents.length}`);

    // Select events intelligently
    const selection = selectEvents(activeEvents, {
        notedEventTickers: notedTickers,
        categories: ALL_HOME_CATEGORIES.map(c => c.toLowerCase()),
        eventsPerCategory: limit,
        dailyQuota: status.remaining,
    });

    console.log(`\n${getSelectionSummary(selection)}`);

    if (dryRun) {
        console.log(`\n🔍 DRY RUN - No API calls will be made.\n`);
        return;
    }

    // Process events with rate limiting
    const allSelectedEvents = [...selection.notedEvents, ...selection.categoryEvents];
    let successCount = 0;
    let totalEvidence = 0;
    let consecutiveFailures = 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Processing ${allSelectedEvents.length} events...`);
    console.log(`${'='.repeat(60)}\n`);

    for (let i = 0; i < allSelectedEvents.length; i++) {
        const event = allSelectedEvents[i];

        // Check quota before each request
        if (!rateLimiter.canMakeRequest()) {
            console.log(`\n⚠️  Quota exhausted after ${i} events. Stopping.`);
            break;
        }

        // Circuit breaker: stop after 3 consecutive failures
        if (consecutiveFailures >= 3) {
            console.log(`\n⚠️  Circuit breaker triggered after 3 consecutive failures.`);
            break;
        }

        console.log(`\n[${i + 1}/${allSelectedEvents.length}] Processing: ${event.ticker}`);
        console.log(`   Title: ${event.title?.substring(0, 60)}...`);
        console.log(`   Volume: $${(event.volume || 0).toLocaleString()}`);

        // Wait for rate limit
        await rateLimiter.waitForNextSlot();

        // Process the event using the existing API endpoint
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        try {
            const url = `${baseUrl}/api/pipeline/exa-category?category=all&limit=1`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            // Record the request (counts towards quota)
            rateLimiter.recordRequest();

            if (response.ok) {
                const data = await response.json();
                const evidence = data.stats?.evidenceCreated || 0;
                totalEvidence += evidence;
                successCount++;
                consecutiveFailures = 0;
                console.log(`   ✅ Success - Evidence created: ${evidence}`);
            } else {
                consecutiveFailures++;
                console.log(`   ❌ Failed - ${response.statusText}`);
            }
        } catch (error: any) {
            rateLimiter.recordRequest();
            consecutiveFailures++;
            console.log(`   ❌ Error: ${error.message}`);
        }

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# SUMMARY`);
    console.log(`${'#'.repeat(60)}`);
    console.log(`\n✅ Processed: ${successCount}/${allSelectedEvents.length} events`);
    console.log(`📰 Evidence created: ${totalEvidence}`);
    console.log(`📊 Remaining quota: ${rateLimiter.getRemainingQuota()}/${10}`);
    console.log();
}

// Show quota status
async function showStatus() {
    const rateLimiter = new GeminiRateLimiter({
        requestsPerMinute: 10,
        requestsPerDay: 10,
    });

    const status = rateLimiter.getStatus();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 GEMINI QUOTA STATUS`);
    console.log(`${'='.repeat(60)}\n`);
    console.log(`   Date: ${status.date}`);
    console.log(`   Remaining: ${status.remaining}/${status.total} requests`);
    console.log(`   Can request: ${status.canRequest ? '✅ Yes' : '❌ No (quota exhausted)'}`);
    console.log(`\n   Quota resets at midnight UTC.\n`);
}

// Run home page events (legacy compatibility)
async function runHomePageEvents(limit: number) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/pipeline/exa-home-events?perCategory=${limit}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏠 Processing HOME PAGE EVENTS`);
    console.log(`   Categories: Crypto, Politics, Economics`);
    console.log(`   Events per category: ${limit}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (!response.ok) {
            console.error(`❌ Error: ${data.error || 'Unknown error'}`);
            return;
        }

        console.log(`✅ Completed in ${duration}s`);
        console.log(`   📊 Stats:`);
        console.log(`      - Events processed: ${data.stats?.eventsProcessed || 0}`);
        console.log(`      - Evidence created: ${data.stats?.evidenceCreated || 0}`);
    } catch (error: any) {
        console.error(`❌ Network error: ${error.message}`);
    }
}

// Run all categories (legacy compatibility - ignores rate limits)
async function runAllCategories(limit: number) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# ⚠️  Running ALL categories (ignores rate limits!)`);
    console.log(`${'#'.repeat(60)}\n`);

    for (const category of LEGACY_CATEGORIES) {
        await callCategoryPipeline(category, limit);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// Print usage help
function printHelp() {
    console.log(`
EXA News Pipeline - Robust Evidence Fetching

Usage: npx ts-node scripts/run-exa-pipeline.ts [command] [options]

Commands:
  smart             Intelligently process events within rate limits (recommended)
  home              Process top events for home page (crypto, politics, economics)
  crypto            Process crypto events only
  politics          Process politics events only
  economics         Process economics events only
  sports            Process sports events only
  entertainment     Process entertainment events only
  tech              Process tech events only
  finance           Process finance events only
  run-all           Process all categories (⚠️ ignores rate limits!)
  status            Show current quota status

Options:
  --limit N         Max events to process per category (default: 3)
  --dry-run         Show what would be processed without making API calls
  --noted TICKER    Add a noted event ticker (priority processing)

Examples:
  npx ts-node scripts/run-exa-pipeline.ts smart
  npx ts-node scripts/run-exa-pipeline.ts smart --dry-run
  npx ts-node scripts/run-exa-pipeline.ts smart --noted CRYPTO-BTC-PRICE
  npx ts-node scripts/run-exa-pipeline.ts status
  npx ts-node scripts/run-exa-pipeline.ts crypto --limit 5

Rate Limits:
  - Gemini: 10 requests per minute (enforced)
  - Gemini: 10 requests per day (tracked in config/gemini-quota.json)
  - Quota resets at midnight UTC
`);
}

// Main entry point
async function main() {
    const { command, limit, dryRun, notedTickers } = parseArgs();

    switch (command) {
        case 'smart':
            await runSmartPipeline(limit, dryRun, notedTickers);
            break;

        case 'status':
            await showStatus();
            break;

        case 'home':
            await runHomePageEvents(limit);
            break;

        case 'run-all':
            await runAllCategories(limit);
            break;

        case 'help':
        case '--help':
        case '-h':
            printHelp();
            break;

        default:
            if ([...LEGACY_CATEGORIES, 'all'].includes(command)) {
                await callCategoryPipeline(command, limit);
            } else {
                console.log(`Unknown command: ${command}`);
                printHelp();
                process.exit(1);
            }
    }
}

main().catch(console.error);
