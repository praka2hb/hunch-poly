/**
 * Gemini Rate Limiter
 * 
 * Enforces rate limits for Gemini API:
 * - 10 RPM (requests per minute) = minimum 6 seconds between requests
 * - 10 RPD (requests per day) = max 10 requests total per day
 * 
 * Persists daily quota to a JSON file for tracking across runs.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RateLimiterConfig {
    requestsPerMinute: number;
    requestsPerDay: number;
    quotaFilePath?: string;
}

interface QuotaState {
    date: string;           // YYYY-MM-DD format
    usedRequests: number;   // How many requests made today
    lastRequestTime: number; // Unix timestamp of last request
}

const DEFAULT_CONFIG: RateLimiterConfig = {
    requestsPerMinute: 10,
    requestsPerDay: 10,
};

export class GeminiRateLimiter {
    private config: RateLimiterConfig;
    private quotaFilePath: string;
    private state: QuotaState;

    constructor(config: Partial<RateLimiterConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.quotaFilePath = config.quotaFilePath ||
            path.join(__dirname, '..', 'config', 'gemini-quota.json');

        this.state = this.loadQuota();
        this.checkDateReset();
    }

    /**
     * Get minimum milliseconds between requests based on RPM limit
     */
    private getMinIntervalMs(): number {
        return Math.ceil(60000 / this.config.requestsPerMinute);
    }

    /**
     * Get today's date in YYYY-MM-DD format (UTC)
     */
    private getTodayDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Check if we need to reset quota for a new day
     */
    private checkDateReset(): void {
        const today = this.getTodayDate();
        if (this.state.date !== today) {
            console.log(`[RateLimiter] New day detected. Resetting quota.`);
            this.state = {
                date: today,
                usedRequests: 0,
                lastRequestTime: 0,
            };
            this.persistQuota();
        }
    }

    /**
     * Load quota state from file
     */
    private loadQuota(): QuotaState {
        try {
            if (fs.existsSync(this.quotaFilePath)) {
                const data = fs.readFileSync(this.quotaFilePath, 'utf-8');
                const parsed = JSON.parse(data);
                console.log(`[RateLimiter] Loaded quota state: ${parsed.usedRequests}/${this.config.requestsPerDay} used today`);
                return parsed;
            }
        } catch (error) {
            console.warn(`[RateLimiter] Failed to load quota file, starting fresh:`, error);
        }

        return {
            date: this.getTodayDate(),
            usedRequests: 0,
            lastRequestTime: 0,
        };
    }

    /**
     * Persist quota state to file
     */
    private persistQuota(): void {
        try {
            const dir = path.dirname(this.quotaFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.quotaFilePath, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.warn(`[RateLimiter] Failed to persist quota:`, error);
        }
    }

    /**
     * Check if we can make a request (within daily quota)
     */
    canMakeRequest(): boolean {
        this.checkDateReset();
        return this.state.usedRequests < this.config.requestsPerDay;
    }

    /**
     * Get remaining daily quota
     */
    getRemainingQuota(): number {
        this.checkDateReset();
        return Math.max(0, this.config.requestsPerDay - this.state.usedRequests);
    }

    /**
     * Get milliseconds to wait before next request (respects RPM limit)
     */
    getWaitTimeMs(): number {
        const now = Date.now();
        const minInterval = this.getMinIntervalMs();
        const elapsed = now - this.state.lastRequestTime;

        if (elapsed >= minInterval) {
            return 0;
        }
        return minInterval - elapsed;
    }

    /**
     * Wait for the next available slot (respects RPM limit)
     */
    async waitForNextSlot(): Promise<void> {
        const waitTime = this.getWaitTimeMs();
        if (waitTime > 0) {
            console.log(`[RateLimiter] Waiting ${(waitTime / 1000).toFixed(1)}s for rate limit...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    /**
     * Record that a request was made
     */
    recordRequest(): void {
        this.state.usedRequests += 1;
        this.state.lastRequestTime = Date.now();
        this.persistQuota();

        const remaining = this.getRemainingQuota();
        console.log(`[RateLimiter] Request recorded. ${remaining}/${this.config.requestsPerDay} remaining today.`);
    }

    /**
     * Get current quota status for logging
     */
    getStatus(): { remaining: number; total: number; date: string; canRequest: boolean } {
        return {
            remaining: this.getRemainingQuota(),
            total: this.config.requestsPerDay,
            date: this.state.date,
            canRequest: this.canMakeRequest(),
        };
    }

    /**
     * Execute a function with rate limiting
     * Handles waiting and quota tracking automatically
     */
    async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T | null> {
        if (!this.canMakeRequest()) {
            console.log(`[RateLimiter] ⚠️ Daily quota exhausted (${this.config.requestsPerDay} requests).`);
            return null;
        }

        await this.waitForNextSlot();

        try {
            const result = await fn();
            this.recordRequest();
            return result;
        } catch (error) {
            // Still count the request even if it failed
            this.recordRequest();
            throw error;
        }
    }
}

// Export a singleton instance with default config
export const geminiRateLimiter = new GeminiRateLimiter();
