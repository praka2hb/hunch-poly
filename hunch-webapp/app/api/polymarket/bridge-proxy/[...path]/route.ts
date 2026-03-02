import { NextRequest, NextResponse } from 'next/server';

/**
 * Catch-all proxy: /api/polymarket/bridge-proxy/[...path]
 *
 * Forwards all requests to https://bridge.polymarket.com so that the
 * Expo app never contacts polymarket.com domains directly (required for
 * regions where Polymarket is blocked, e.g. India).
 *
 * Proxied endpoints:
 *   GET  /supported-assets
 *   POST /deposit   (create deposit addresses)
 *   POST /withdraw  (create withdrawal addresses)
 */

const TARGET = 'https://bridge.polymarket.com';

const HOP_BY_HOP = new Set([
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
]);

async function proxyRequest(
    request: NextRequest,
    params: Promise<{ path: string[] }>
): Promise<NextResponse> {
    const { path } = await params;
    const subPath = '/' + path.join('/');
    const search = request.nextUrl.search;
    const targetUrl = `${TARGET}${subPath}${search}`;

    const forwardHeaders = new Headers();
    request.headers.forEach((value, key) => {
        if (!HOP_BY_HOP.has(key.toLowerCase())) {
            forwardHeaders.set(key, value);
        }
    });

    const isBodyMethod = !['GET', 'HEAD'].includes(request.method.toUpperCase());
    const body = isBodyMethod ? await request.arrayBuffer() : undefined;

    let upstream: Response;
    try {
        upstream = await fetch(targetUrl, {
            method: request.method,
            headers: forwardHeaders,
            body: body ? body : undefined,
            // @ts-expect-error — duplex required for streaming body in Node 18+
            duplex: 'half',
        });
    } catch (err: any) {
        console.error('[bridge-proxy] Upstream fetch failed:', targetUrl, err?.message);
        return NextResponse.json(
            { error: 'Bridge proxy upstream error', detail: err?.message },
            { status: 502 }
        );
    }

    const responseBody = await upstream.arrayBuffer();

    // Node's fetch auto-decompresses gzip/br, so content-encoding &
    // content-length from upstream are stale — strip them to avoid
    // the client seeing a mismatched or empty body.
    const STRIP_RESPONSE = new Set([...HOP_BY_HOP, 'content-encoding', 'content-length']);
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
        if (!STRIP_RESPONSE.has(key.toLowerCase())) {
            responseHeaders.set(key, value);
        }
    });

    return new NextResponse(responseBody, {
        status: upstream.status,
        headers: responseHeaders,
    });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxyRequest(req, params);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxyRequest(req, params);
}
