/**
 * Quick test for extractOutcomeLabel logic.
 * Run with: node scripts/test-outcome-label.mjs
 */

function extractOutcomeLabel(title) {
  if (!title) return '';

  let s = title.trimStart();
  if (s.toLowerCase().startsWith('will ')) {
    s = s.slice(5);
  }

  const VERB_PHRASES = [' win', ' be ', ' get ', ' become ', ' receive ', ' earn ', ' secure ', ' take ', ' retain ', ' lose ', ' fall'];
  let cutAt = -1;
  for (const verb of VERB_PHRASES) {
    const idx = s.toLowerCase().indexOf(verb);
    if (idx !== -1 && (cutAt === -1 || idx < cutAt)) {
      cutAt = idx;
    }
  }

  if (cutAt > 0) return s.slice(0, cutAt).trim();
  return s.length > 30 ? s.slice(0, 30).trimEnd() + '…' : s.trim();
}

const cases = [
  ['Will Spain win the 2026 FIFA World Cup?',                                      'Spain'],
  ['Will Gavin Newsom win the 2028 Democratic presidential nomination?',            'Gavin Newsom'],
  ['Will Pete Buttigieg win the 2028 Democratic presidential nomination?',          'Pete Buttigieg'],
  ['Will Alexandria Ocasio-Cortez win the 2028 Democratic presidential nomination?','Alexandria Ocasio-Cortez'],
  ['Will Andy Beshear win the 2028 Democratic presidential nomination?',            'Andy Beshear'],
  ['Will Norway win the 2026 FIFA World Cup?',                                     'Norway'],
  ['Will Germany win the 2026 FIFA World Cup?',                                    'Germany'],
  // Edge cases
  ['Will the Iranian regime fall by March 31?',                                    'the Iranian regime'],
  ['Will Bitcoin be above $100k by end of March?',                                 'Bitcoin'],
  ['Will Trump become president again?',                                            'Trump'],
  ['No verb phrase at all in this unusually long title string here yes',            'No verb phrase at all in this…'],
  [null,                                                                            ''],
];

let passed = 0;
let failed = 0;

for (const [input, expected] of cases) {
  const got = extractOutcomeLabel(input);
  const ok = got === expected;
  if (ok) {
    passed++;
    console.log(`  ✓  "${input?.slice(0, 50) ?? 'null'}" → "${got}"`);
  } else {
    failed++;
    console.log(`  ✗  "${input?.slice(0, 50) ?? 'null'}"`);
    console.log(`       expected: "${expected}"`);
    console.log(`       got:      "${got}"`);
  }
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
