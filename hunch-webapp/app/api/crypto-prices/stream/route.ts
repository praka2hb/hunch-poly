import { NextRequest } from 'next/server';

/**
 * GET /api/crypto-prices/stream
 *
 * Server-Sent Events proxy for Polymarket Chainlink crypto prices.
 * Opens an upstream WebSocket to wss://ws-live-data.polymarket.com
 * and forwards price updates as SSE events to the client.
 *
 * This avoids the mobile app connecting directly to polymarket.com,
 * which is blocked in certain regions.
 */

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes max per connection

const UPSTREAM_WS = 'wss://ws-live-data.polymarket.com';
const PING_MS = 5_000;
const HEARTBEAT_MS = 15_000;

export async function GET(request: NextRequest) {
    const encoder = new TextEncoder();

    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    function cleanup() {
        if (closed) return;
        closed = true;
        if (pingTimer) clearInterval(pingTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        pingTimer = heartbeatTimer = null;
        if (ws) { try { ws.close(); } catch { /* ignore */ } }
        ws = null;
    }

    const stream = new ReadableStream({
        start(controller) {
            // Initial SSE comment to establish connection
            controller.enqueue(encoder.encode(':connected\n\n'));

            // Open upstream WebSocket to Polymarket
            ws = new WebSocket(UPSTREAM_WS);

            ws.addEventListener('open', () => {
                // Subscribe to all crypto price feeds
                ws!.send(JSON.stringify({
                    action: 'subscribe',
                    subscriptions: [
                        { topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' },
                        { topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"eth/usd"}' },
                        { topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"sol/usd"}' },
                    ],
                }));

                // Ping upstream to keep alive
                pingTimer = setInterval(() => {
                    if (ws?.readyState === WebSocket.OPEN) ws.send('PING');
                }, PING_MS);

                // SSE heartbeat comment to prevent intermediate proxies from closing idle connections
                heartbeatTimer = setInterval(() => {
                    if (closed) return;
                    try {
                        controller.enqueue(encoder.encode(':hb\n\n'));
                    } catch {
                        cleanup();
                    }
                }, HEARTBEAT_MS);
            });

            ws.addEventListener('message', (ev) => {
                const data = typeof ev.data === 'string' ? ev.data : '';
                if (data === 'PONG' || !data) return;
                if (closed) return;

                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    cleanup();
                }
            });

            ws.addEventListener('close', () => {
                cleanup();
                try { controller.close(); } catch { /* already closed */ }
            });

            ws.addEventListener('error', () => {
                cleanup();
                try { controller.close(); } catch { /* already closed */ }
            });

            // Clean up when the client disconnects
            request.signal.addEventListener('abort', () => {
                cleanup();
                try { controller.close(); } catch { /* already closed */ }
            });
        },

        cancel() {
            cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Accel-Buffering': 'no', // Disable nginx/proxy buffering
        },
    });
}
