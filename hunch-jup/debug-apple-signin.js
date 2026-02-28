#!/usr/bin/env node

/**
 * Advanced Apple Sign In Debugger
 * This script tests the OAuth configuration and provides detailed diagnostics
 */

const https = require('https');

const CONFIG = {
    bundleId: 'com.hunch.run',
    teamId: 'YOUR_TEAM_ID_HERE', // REPLACE WITH YOUR ACTUAL TEAM ID
    keyId: 'DZA3A74VVX',
    servicesId: 'YOUR_SERVICES_ID_HERE', // e.g., com.hunch.run.signin
    privyAppId: 'cmiq91u0h006jl70cuyb6az3f',
    callbackUrl: 'https://auth.privy.io/api/v1/oauth/callback',
};

console.log('\n' + '='.repeat(70));
console.log('🔍 ADVANCED APPLE SIGN IN DIAGNOSTICS');
console.log('='.repeat(70) + '\n');

// Check 1: Configuration Values
console.log('1️⃣  Configuration Values Check:');
console.log('-'.repeat(70));

const checks = [];

if (CONFIG.teamId === 'YOUR_TEAM_ID_HERE' || CONFIG.teamId.length !== 10) {
    checks.push({ status: '❌', item: 'Team ID', issue: 'Not configured or invalid length' });
} else {
    checks.push({ status: '✅', item: 'Team ID', issue: 'Valid format (10 chars)' });
}

if (CONFIG.servicesId === 'YOUR_SERVICES_ID_HERE') {
    checks.push({ status: '❌', item: 'Services ID', issue: 'Not configured' });
} else {
    checks.push({ status: '✅', item: 'Services ID', issue: `Set to ${CONFIG.servicesId}` });
}

checks.forEach(check => {
    console.log(`   ${check.status} ${check.item}: ${check.issue}`);
});

console.log();

// Check 2: URL Format Validation
console.log('2️⃣  URL & Identifier Validation:');
console.log('-'.repeat(70));

const urlChecks = [
    {
        name: 'Callback URL uses HTTPS',
        valid: CONFIG.callbackUrl.startsWith('https://'),
        value: CONFIG.callbackUrl
    },
    {
        name: 'Callback URL has no trailing slash',
        valid: !CONFIG.callbackUrl.endsWith('/'),
        value: CONFIG.callbackUrl
    },
    {
        name: 'Bundle ID format',
        valid: /^[a-z0-9.]+$/.test(CONFIG.bundleId),
        value: CONFIG.bundleId
    },
    {
        name: 'Bundle ID uses reverse domain',
        valid: CONFIG.bundleId.split('.').length >= 2,
        value: CONFIG.bundleId
    }
];

urlChecks.forEach(check => {
    const status = check.valid ? '✅' : '❌';
    console.log(`   ${status} ${check.name}`);
    if (!check.valid) {
        console.log(`      Current: ${check.value}`);
    }
});

console.log();

// Check 3: Privy Dashboard Checklist
console.log('3️⃣  Privy Dashboard Configuration Checklist:');
console.log('-'.repeat(70));
console.log('   Navigate to: https://dashboard.privy.io');
console.log('   Path: Settings → Login Methods → Social Login → Apple\n');
console.log('   ⚠️  CRITICAL: Verify these EXACT values:\n');
console.log(`   Client ID:    ${CONFIG.bundleId}`);
console.log('                 ↑ Must be Bundle ID, NOT Services ID');
console.log(`   Team ID:      ${CONFIG.teamId}`);
console.log('                 ↑ Must be exactly 10 characters');
console.log(`   Key ID:       ${CONFIG.keyId}`);
console.log('   Private Key:  -----BEGIN PRIVATE KEY-----');
console.log('                 [5 lines of key content]');
console.log('                 -----END PRIVATE KEY-----');
console.log('                 ↑ Must include BEGIN/END lines, no extra spaces\n');

console.log('   🔗 Redirect URIs Section:');
console.log('   - Ensure "hunch://" is added to allowed redirect URIs\n');

// Check 4: Apple Developer Portal Checklist
console.log('4️⃣  Apple Developer Portal Configuration:');
console.log('-'.repeat(70));
console.log('\n   📱 App ID Configuration:');
console.log('   → https://developer.apple.com/account/resources/identifiers/list');
console.log(`   → Select: ${CONFIG.bundleId}`);
console.log('   → Sign in with Apple: ✓ ENABLED');
console.log('   → Click "Edit" → Configure as "Primary App ID"');

console.log('\n   🔐 Services ID Configuration (REQUIRED):');
console.log('   → https://developer.apple.com/account/resources/identifiers/list/serviceId');
console.log(`   → Identifier: ${CONFIG.servicesId}`);
console.log('   → Sign in with Apple: ✓ ENABLED');
console.log('   → Click "Configure":');
console.log(`      • Primary App ID: ${CONFIG.bundleId}`);
console.log('      • Domains: auth.privy.io');
console.log(`      • Return URLs: ${CONFIG.callbackUrl}`);
console.log('        ⚠️  Must be EXACT match - no trailing slash, must be HTTPS');

console.log('\n   🔑 Key Configuration:');
console.log('   → https://developer.apple.com/account/resources/authkeys/list');
console.log(`   → Find Key ID: ${CONFIG.keyId}`);
console.log('   → Sign in with Apple: ✓ ENABLED');
console.log(`   → Verify Team ID in top-right: ${CONFIG.teamId}`);

console.log();

// Check 5: Common Configuration Mistakes
console.log('5️⃣  Common Configuration Mistakes to Avoid:');
console.log('-'.repeat(70));
const mistakes = [
    'Using Services ID as Client ID in Privy (should be Bundle ID)',
    'Services ID not created or not configured in Apple Portal',
    'Return URL in Services ID different from https://auth.privy.io/api/v1/oauth/callback',
    'Domain "auth.privy.io" not added to Services ID',
    'Private key pasted without BEGIN/END markers',
    'Private key has extra spaces or line breaks',
    'Team ID is incorrect or from different Apple account',
    'Redirect URI "hunch://" not added in Privy Dashboard',
    'Forgot to wait 10-15 minutes after Apple Portal changes',
    'Using Bundle ID from different project or typo in Bundle ID'
];

mistakes.forEach((mistake, i) => {
    console.log(`   ${i + 1}. ❌ ${mistake}`);
});

console.log();

// Check 6: Troubleshooting Steps
console.log('6️⃣  Detailed Troubleshooting Steps:');
console.log('-'.repeat(70));
console.log('\n   Step 1: Verify Private Key Format');
console.log('   • Open AuthKey_DZA3A74VVX.p8 file');
console.log('   • Should have exactly 7 lines:');
console.log('     Line 1: -----BEGIN PRIVATE KEY-----');
console.log('     Lines 2-6: Key content (base64)');
console.log('     Line 7: -----END PRIVATE KEY-----');
console.log('   • Copy ALL 7 lines into Privy Dashboard');
console.log('   • Do NOT add extra newlines or spaces');

console.log('\n   Step 2: Verify Team ID');
console.log('   • Log in to https://developer.apple.com/account');
console.log('   • Look at top-right corner');
console.log('   • Format: "Team Name (XXXXXXXXXX)"');
console.log('   • The XXXXXXXXXX is your Team ID (10 alphanumeric chars)');
console.log(`   • Verify it matches: ${CONFIG.teamId}`);

console.log('\n   Step 3: Double-Check Services ID Return URL');
console.log('   • Go to Services ID configuration');
console.log('   • Click "Configure" next to Sign in with Apple');
console.log('   • Return URLs section should show EXACTLY:');
console.log('     https://auth.privy.io/api/v1/oauth/callback');
console.log('   • Check character-by-character for typos');
console.log('   • No trailing slash (/)');
console.log('   • No extra query parameters');

console.log('\n   Step 4: Clear All Caches');
console.log('   • In Expo: Press "Shift + R" to reload');
console.log('   • Close and reopen the iOS Simulator/Device');
console.log('   • In Privy Dashboard: Log out and log back in');
console.log('   • Wait 15 minutes after any Apple Portal changes');

console.log('\n   Step 5: Test with Privy Support');
console.log('   • If still failing, contact Privy support with:');
console.log(`     - Privy App ID: ${CONFIG.privyAppId}`);
console.log(`     - Bundle ID: ${CONFIG.bundleId}`);
console.log(`     - Team ID: ${CONFIG.teamId}`);
console.log(`     - Key ID: ${CONFIG.keyId}`);
console.log('     - Error: "Unable to exchange oauth code for provider"');
console.log('     - Request server-side logs for detailed error');

console.log();

// Check 7: Privy SDK Configuration
console.log('7️⃣  Privy SDK Configuration Check:');
console.log('-'.repeat(70));
console.log('   Verify PrivyProvider in app/_layout.tsx has:');
console.log('   • appId prop set correctly');
console.log('   • clientId prop set correctly');
console.log('   • Consider adding storage and loginMethods config');
console.log();

console.log('='.repeat(70));
console.log('📝 NEXT STEPS:');
console.log('='.repeat(70));
console.log('\n1. Fill in YOUR_TEAM_ID_HERE and YOUR_SERVICES_ID_HERE in this file');
console.log('2. Re-run: node debug-apple-signin.js');
console.log('3. Follow each checklist item above');
console.log('4. Wait 15 minutes after Apple Portal changes');
console.log('5. Try Apple Sign In again');
console.log('6. If still failing, check Expo logs for new error details\n');
console.log('='.repeat(70) + '\n');
