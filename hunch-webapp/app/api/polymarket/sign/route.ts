import { NextRequest, NextResponse } from 'next/server';
import { buildHmacSignature } from '@polymarket/builder-signing-sdk';

/**
 * POST /api/polymarket/sign
 *
 * Builder signing endpoint. The Expo app calls this to get HMAC signatures
 * for Polymarket builder operations without exposing the builder secret.
 *
 * No user auth required (the Expo app calls this during trading).
 * Rate limiting recommended in production (via middleware or Vercel config).
 *
 * Body: { method: string, path: string, body?: string }
 *
 * Returns: {
 *   POLY_BUILDER_SIGNATURE: string,
 *   POLY_BUILDER_TIMESTAMP: string,
 *   POLY_BUILDER_API_KEY: string,
 *   POLY_BUILDER_PASSPHRASE: string
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const builderApiKey = process.env.POLYMARKET_BUILDER_API_KEY;
        const builderSecret = process.env.POLYMARKET_BUILDER_SECRET;
        const builderPassphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE;

        if (!builderApiKey || !builderSecret || !builderPassphrase) {
            console.error('[polymarket/sign] Missing builder credentials in environment');
            return NextResponse.json(
                { error: 'Builder signing not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { method, path, body: requestBody } = body;

        if (!method || typeof method !== 'string') {
            return NextResponse.json({ error: 'method is required' }, { status: 400 });
        }
        if (!path || typeof path !== 'string') {
            return NextResponse.json({ error: 'path is required' }, { status: 400 });
        }

        const timestamp = Math.floor(Date.now() / 1000);

        // Build the HMAC signature using the Polymarket builder signing SDK
        const signature = buildHmacSignature(
            builderSecret,
            timestamp,
            method.toUpperCase(),
            path,
            requestBody || ''
        );

        return NextResponse.json({
            POLY_BUILDER_SIGNATURE: signature,
            POLY_BUILDER_TIMESTAMP: String(timestamp),
            POLY_BUILDER_API_KEY: builderApiKey,
            POLY_BUILDER_PASSPHRASE: builderPassphrase,
        });
    } catch (error: any) {
        console.error('[API /polymarket/sign] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate builder signature' },
            { status: 500 }
        );
    }
}
