import { NextResponse } from 'next/server';
import { fetchGammaTags } from '@/app/lib/polymarketGamma';

/**
 * GET /api/categories
 *
 * Returns the live list of Polymarket event categories (tags) from the Gamma API.
 * Each category includes a slug (use as tag filter), label (display name), and id.
 *
 * Always prepends an "all" category for displaying all events.
 *
 * Example response:
 * {
 *   "categories": [
 *     { "slug": "all", "label": "All", "id": "all" },
 *     { "slug": "politics", "label": "Politics", "id": "100023" },
 *     { "slug": "crypto", "label": "Crypto", "id": "100018" },
 *     ...
 *   ]
 * }
 */
export async function GET() {
    try {
        const tags = await fetchGammaTags();

        // Normalise: ensure every entry has id, slug, label
        const categories = [
            { id: 'all', slug: 'all', label: 'All' },
            ...tags
                .filter((t) => t.slug && t.label)
                .map((t) => ({
                    id: t.id,
                    slug: t.slug,
                    label: t.label,
                })),
        ];

        return NextResponse.json({ categories }, {
            headers: {
                // Cache for 10 minutes — tags don't change often
                'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
            },
        });
    } catch (error: unknown) {
        console.error('[API /categories] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch categories' },
            { status: 500 }
        );
    }
}
