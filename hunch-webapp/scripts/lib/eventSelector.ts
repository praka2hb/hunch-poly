/**
 * Event Selector
 * 
 * Intelligent event selection for the evidence pipeline:
 * - Prioritizes "noted events" (always processed first)
 * - Selects top events by volume from each category
 * - Respects daily quota limits
 */

// All 13 categories from the Home page
export const ALL_HOME_CATEGORIES = [
    'Climate and Weather',
    'Companies',
    'Crypto',
    'Economics',
    'Elections',
    'Entertainment',
    'Financials',
    'Mentions',
    'Politics',
    'Science and Technology',
    'Social',
    'Sports',
    'Transportation',
];

// Topic filters for keyword matching (lowercase)
export const TOPIC_FILTERS: Record<string, string[]> = {
    'climate and weather': ['climate', 'weather', 'temperature', 'hurricane', 'wildfire', 'flood', 'drought', 'storm', 'tornado'],
    'companies': ['company', 'corporate', 'ceo', 'earnings', 'layoff', 'hire', 'acquisition', 'merger', 'startup'],
    'crypto': ['crypto', 'bitcoin', 'btc', 'eth', 'ethereum', 'solana', 'sol', 'token', 'defi', 'nft', 'blockchain', 'web3', 'memecoin', 'altcoin', 'stablecoin', 'usdc', 'usdt'],
    'economics': ['fed ', 'federal reserve', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'treasury', 'bond', 'yield', 'economic', 'tariff', 'trade war', 'unemployment', 'cpi', 'ppi'],
    'elections': ['election', 'vote', 'voting', 'ballot', 'primary', 'caucus', 'electoral', 'candidate', 'poll', 'swing state'],
    'entertainment': ['movie', 'film', 'music', 'celebrity', 'awards', 'oscar', 'grammy', 'emmy', 'tv show', 'streaming', 'netflix', 'disney', 'spotify', 'concert', 'album', 'box office'],
    'financials': ['stock', 's&p 500', 'nasdaq', 'dow jones', 'ipo', 'market cap', 'shares', 'dividend', 'hedge fund', 'wall street'],
    'mentions': ['trending', 'viral', 'mention', 'hashtag', 'social media', 'twitter', 'x.com'],
    'politics': ['president', 'congress', 'senate', 'government', 'trump', 'biden', 'democrat', 'republican', 'political', 'governor', 'mayor', 'impeach', 'cabinet', 'white house'],
    'science and technology': ['ai ', ' ai', 'artificial intelligence', 'openai', 'chatgpt', 'gpt-', 'llm', 'machine learning', 'robotics', 'autonomous', 'space', 'nasa', 'rocket', 'satellite'],
    'social': ['protest', 'movement', 'activism', 'rally', 'demonstration', 'community', 'public opinion'],
    'sports': ['football', 'basketball', 'soccer', 'nfl', 'nba', 'mlb', 'nhl', 'tennis', 'golf', 'ufc', 'mma', 'boxing', 'f1', 'formula 1', 'racing', 'olympics', 'world cup', 'championship', 'playoff', 'super bowl'],
    'transportation': ['airline', 'aviation', 'car', 'automotive', 'tesla', 'ev ', 'electric vehicle', 'train', 'shipping', 'port', 'logistics'],
};

export interface Event {
    ticker: string;
    title: string;
    subtitle?: string;
    volume?: number;
    volume24h?: number;
    markets?: any[];
    category?: string;
}

export interface EventSelectionConfig {
    notedEventTickers: string[];  // Priority events (always processed first)
    categories: string[];          // Categories to include
    eventsPerCategory: number;     // Max events per category
    dailyQuota: number;            // Max total events to process
}

export interface SelectedEvents {
    notedEvents: Event[];
    categoryEvents: Event[];
    totalCount: number;
    quotaUsed: number;
}

/**
 * Load noted event tickers from environment variable or config
 */
export function loadNotedEventTickers(): string[] {
    const envTickers = process.env.NOTED_EVENT_TICKERS;
    if (envTickers) {
        return envTickers.split(',').map(t => t.trim()).filter(Boolean);
    }
    return [];
}

/**
 * Categorize an event based on its title/subtitle matching topic keywords
 */
export function categorizeEvent(event: Event): string | null {
    const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();

    for (const [category, keywords] of Object.entries(TOPIC_FILTERS)) {
        if (keywords.some(keyword => searchText.includes(keyword.toLowerCase()))) {
            return category;
        }
    }
    return null;
}

/**
 * Select events intelligently based on quota and priorities
 */
export function selectEvents(
    allEvents: Event[],
    config: EventSelectionConfig
): SelectedEvents {
    const { notedEventTickers, categories, eventsPerCategory, dailyQuota } = config;

    // 1. Extract noted events (priority)
    const notedEvents: Event[] = [];
    const remainingEvents: Event[] = [];

    for (const event of allEvents) {
        if (notedEventTickers.includes(event.ticker)) {
            notedEvents.push(event);
        } else {
            remainingEvents.push(event);
        }
    }

    // 2. Calculate remaining quota after noted events
    const quotaForCategories = Math.max(0, dailyQuota - notedEvents.length);

    if (quotaForCategories === 0) {
        return {
            notedEvents,
            categoryEvents: [],
            totalCount: notedEvents.length,
            quotaUsed: notedEvents.length,
        };
    }

    // 3. Group remaining events by category
    const eventsByCategory: Record<string, Event[]> = {};
    for (const category of categories) {
        eventsByCategory[category.toLowerCase()] = [];
    }

    for (const event of remainingEvents) {
        const category = categorizeEvent(event);
        if (category && eventsByCategory[category]) {
            eventsByCategory[category].push(event);
        }
    }

    // 4. Sort each category by volume and take top N
    for (const category of Object.keys(eventsByCategory)) {
        eventsByCategory[category] = eventsByCategory[category]
            .sort((a, b) => (b.volume || b.volume24h || 0) - (a.volume || a.volume24h || 0))
            .slice(0, eventsPerCategory);
    }

    // 5. Interleave events from categories fairly (round-robin)
    const categoryEvents: Event[] = [];
    let round = 0;
    const categoryKeys = Object.keys(eventsByCategory).filter(k => eventsByCategory[k].length > 0);

    while (categoryEvents.length < quotaForCategories && categoryKeys.length > 0) {
        let addedThisRound = false;

        for (const category of [...categoryKeys]) {
            if (categoryEvents.length >= quotaForCategories) break;

            const events = eventsByCategory[category];
            if (round < events.length) {
                categoryEvents.push(events[round]);
                addedThisRound = true;
            }
        }

        if (!addedThisRound) break;
        round++;
    }

    return {
        notedEvents,
        categoryEvents,
        totalCount: notedEvents.length + categoryEvents.length,
        quotaUsed: notedEvents.length + categoryEvents.length,
    };
}

/**
 * Get a summary of selected events for logging
 */
export function getSelectionSummary(selection: SelectedEvents): string {
    const lines: string[] = [];

    if (selection.notedEvents.length > 0) {
        lines.push(`📌 Noted Events (${selection.notedEvents.length}):`);
        selection.notedEvents.forEach((e, i) => {
            lines.push(`   ${i + 1}. ${e.ticker} - ${e.title?.substring(0, 50)}...`);
        });
    }

    if (selection.categoryEvents.length > 0) {
        // Group by category for display
        const byCategory: Record<string, Event[]> = {};
        for (const event of selection.categoryEvents) {
            const cat = event.category || categorizeEvent(event) || 'unknown';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(event);
        }

        lines.push(`📊 Category Events (${selection.categoryEvents.length}):`);
        for (const [cat, events] of Object.entries(byCategory)) {
            lines.push(`   ${cat.toUpperCase()}:`);
            events.forEach((e, i) => {
                lines.push(`      ${i + 1}. ${e.ticker} - ${e.title?.substring(0, 40)}...`);
            });
        }
    }

    lines.push(`\n📈 Total: ${selection.totalCount} events selected (quota: ${selection.quotaUsed})`);

    return lines.join('\n');
}
