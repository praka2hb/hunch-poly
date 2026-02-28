
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testCategory(category: string) {
    const url = `${BASE_URL}/api/dflow/series?category=${encodeURIComponent(category)}&isInitialized=true&status=active`;
    console.log(`Testing category: "${category}" -> ${url}`);

    try {
        const res = await fetch(url);
        console.log(`Response status: ${res.status}`);

        if (!res.ok) {
            const text = await res.text();
            console.error(`Error body: ${text}`);
        } else {
            const json = await res.json();
            console.log(`Success! Found ${json.series?.length || 0} series.`);
        }
    } catch (e: any) {
        console.error(`Fetch failed: ${e.message}`);
    }
    console.log('-'.repeat(40));
}

async function main() {
    console.log('Starting reproduction script...');

    await testCategory('Entertainment');
    await testCategory('entertainment');
    await testCategory('Sports');
    await testCategory('sports');
    await testCategory('Crypto');
}


main().catch(console.error);

export { };

