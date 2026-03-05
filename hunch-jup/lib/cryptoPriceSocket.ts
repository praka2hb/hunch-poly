/**
 * cryptoPriceSocket.ts — Proxied crypto price stream
 *
 * Connects to our backend SSE proxy at /api/crypto-prices/stream
 * which relays Polymarket Chainlink price updates (btc/usd, eth/usd, sol/usd).
 *
 * This avoids direct connections to polymarket.com domains,
 * which are unreachable in certain regions.
 */

import { API_BASE_URL } from './api';

export interface PricePoint {
    timestamp: number; // unix ms
    price: number;
}

type Asset = 'btc' | 'eth' | 'sol';
type PriceCallback = (price: number, history: PricePoint[]) => void;

const RECONNECT_DELAY_MS = 3_000;
const MAX_HISTORY = 500;

// Chainlink symbol → our asset key
const SYMBOL_MAP: Record<string, Asset> = {
    'btc/usd': 'btc',
    'eth/usd': 'eth',
    'sol/usd': 'sol',
};

class CryptoPriceSocket {
    private xhr: XMLHttpRequest | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connected = false;
    private shouldReconnect = true;
    private refCount = 0;

    // SSE parse state
    private lastReadIndex = 0;
    private sseBuffer = '';

    // Per-asset state
    private latestPrices: Record<Asset, number | null> = { btc: null, eth: null, sol: null };
    private histories: Record<Asset, PricePoint[]> = { btc: [], eth: [], sol: [] };
    private subscribers: Record<Asset, Set<PriceCallback>> = {
        btc: new Set(),
        eth: new Set(),
        sol: new Set(),
    };

    /** Subscribe to price updates for an asset. Returns an unsubscribe function. */
    subscribe(asset: Asset, callback: PriceCallback): () => void {
        this.subscribers[asset].add(callback);
        this.refCount++;

        // Connect if this is the first subscriber
        if (this.refCount === 1) {
            this.connect();
        }

        // Immediately fire with latest data if available
        if (this.latestPrices[asset] !== null) {
            callback(this.latestPrices[asset]!, [...this.histories[asset]]);
        }

        return () => {
            this.subscribers[asset].delete(callback);
            this.refCount--;
            if (this.refCount <= 0) {
                this.refCount = 0;
                this.disconnect();
            }
        };
    }

    getLatestPrice(asset: string): number | null {
        return this.latestPrices[asset as Asset] ?? null;
    }

    getHistory(asset: string): PricePoint[] {
        return [...(this.histories[asset as Asset] || [])];
    }

    // ─── SSE connection via XMLHttpRequest ────────────────────────────────
    // XHR fires onprogress as chunked data arrives, which is universally
    // supported in React Native (iOS via NSURLSession, Android via OkHttp).

    private connect() {
        if (this.xhr) return;
        this.shouldReconnect = true;
        this.sseBuffer = '';
        this.lastReadIndex = 0;

        const url = `${API_BASE_URL}/api/crypto-prices/stream`;
        const xhr = new XMLHttpRequest();
        this.xhr = xhr;

        xhr.open('GET', url, true);
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Cache-Control', 'no-cache');

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                this.connected = true;
            }
        };

        xhr.onprogress = () => {
            // Read only new data since last position
            const newData = xhr.responseText.substring(this.lastReadIndex);
            this.lastReadIndex = xhr.responseText.length;
            if (newData) {
                this.processSSEChunk(newData);
            }
        };

        xhr.onerror = () => {
            this.handleStreamEnd();
        };

        xhr.onabort = () => {
            // Intentional abort — don't reconnect (shouldReconnect already false)
        };

        xhr.onloadend = () => {
            // Stream ended (server closed, maxDuration hit, or network drop)
            this.handleStreamEnd();
        };

        xhr.send();
    }

    private handleStreamEnd() {
        this.connected = false;
        this.xhr = null;
        this.lastReadIndex = 0;
        this.sseBuffer = '';
        if (this.shouldReconnect && this.refCount > 0) {
            this.scheduleReconnect();
        }
    }

    private disconnect() {
        this.shouldReconnect = false;
        this.cleanup();
    }

    private cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.xhr) {
            const x = this.xhr;
            this.xhr = null;
            try { x.abort(); } catch { /* ignore */ }
        }
        this.connected = false;
        this.lastReadIndex = 0;
        this.sseBuffer = '';
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect && this.refCount > 0) {
                this.connect();
            }
        }, RECONNECT_DELAY_MS);
    }

    // ─── SSE parser ──────────────────────────────────────────────────────
    // Buffers partial chunks and splits on double-newline boundaries.

    private processSSEChunk(chunk: string) {
        this.sseBuffer += chunk;

        // Split on double-newline (SSE event boundary)
        const parts = this.sseBuffer.split('\n\n');
        // Last part may be incomplete — keep in buffer
        this.sseBuffer = parts.pop() || '';

        for (const part of parts) {
            if (!part.trim()) continue;
            const lines = part.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    try {
                        const msg = JSON.parse(data);
                        if (msg.topic === 'crypto_prices_chainlink' && msg.payload) {
                            this.handlePriceUpdate(msg.payload);
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
                // SSE comments (:connected, :hb) are silently ignored
            }
        }
    }

    // ─── Price handling (unchanged logic) ─────────────────────────────────

    private handlePriceUpdate(payload: { symbol: string; timestamp: number; value: number }) {
        const asset = SYMBOL_MAP[payload.symbol];
        if (!asset) return;

        const price = payload.value;
        const point: PricePoint = {
            timestamp: payload.timestamp,
            price,
        };

        this.latestPrices[asset] = price;

        // Append to history, cap at MAX_HISTORY
        const history = this.histories[asset];
        history.push(point);
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
        }

        // Notify all subscribers for this asset
        const snapshot = [...history];
        this.subscribers[asset].forEach((cb) => {
            try {
                cb(price, snapshot);
            } catch {
                // Don't let subscriber errors kill the stream
            }
        });
    }
}

// Singleton instance
const cryptoPriceSocket = new CryptoPriceSocket();
export default cryptoPriceSocket;
