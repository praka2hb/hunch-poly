/**
 * cryptoPriceSocket.ts — Singleton WebSocket for Polymarket Chainlink crypto prices
 *
 * Connects to wss://ws-live-data.polymarket.com and subscribes to
 * crypto_prices_chainlink for btc/usd, eth/usd, sol/usd.
 */

export interface PricePoint {
    timestamp: number; // unix ms
    price: number;
}

type Asset = 'btc' | 'eth' | 'sol';
type PriceCallback = (price: number, history: PricePoint[]) => void;

const WS_URL = 'wss://ws-live-data.polymarket.com';
const PING_INTERVAL_MS = 5_000;
const RECONNECT_DELAY_MS = 3_000;
const MAX_HISTORY = 500;

// Chainlink symbol → our asset key
const SYMBOL_MAP: Record<string, Asset> = {
    'btc/usd': 'btc',
    'eth/usd': 'eth',
    'sol/usd': 'sol',
};

class CryptoPriceSocket {
    private ws: WebSocket | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connected = false;
    private shouldReconnect = true;
    private refCount = 0;

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

    private connect() {
        if (this.ws) return;
        this.shouldReconnect = true;

        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                this.connected = true;
                this.sendSubscription();
                this.startPing();
            };

            this.ws.onmessage = (event) => {
                if (event.data === 'PONG') return;

                try {
                    const msg = JSON.parse(event.data as string);
                    if (msg.topic === 'crypto_prices_chainlink' && msg.payload) {
                        this.handlePriceUpdate(msg.payload);
                    }
                } catch {
                    // Ignore parse errors
                }
            };

            this.ws.onerror = () => {
                // onclose will fire after this
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.cleanup();
                if (this.shouldReconnect && this.refCount > 0) {
                    this.reconnectTimer = setTimeout(() => {
                        this.ws = null;
                        this.connect();
                    }, RECONNECT_DELAY_MS);
                }
            };
        } catch {
            // Reconnect on connection failure
            if (this.shouldReconnect && this.refCount > 0) {
                this.reconnectTimer = setTimeout(() => {
                    this.ws = null;
                    this.connect();
                }, RECONNECT_DELAY_MS);
            }
        }
    }

    private disconnect() {
        this.shouldReconnect = false;
        this.cleanup();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private cleanup() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private sendSubscription() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg = JSON.stringify({
            action: 'subscribe',
            subscriptions: [
                { topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' },
                { topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"eth/usd"}' },
                { topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"sol/usd"}' },
            ],
        });

        this.ws.send(msg);
    }

    private startPing() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('PING');
            }
        }, PING_INTERVAL_MS);
    }

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
                // Don't let subscriber errors kill the socket
            }
        });
    }
}

// Singleton instance
const cryptoPriceSocket = new CryptoPriceSocket();
export default cryptoPriceSocket;
