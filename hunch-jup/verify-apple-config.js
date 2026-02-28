// Apple Sign In Configuration Validator
// Run this to verify your configuration values

console.log('='.repeat(60));
console.log('🍎 Apple Sign In Configuration Validator');
console.log('='.repeat(60));
console.log();

// Your configuration
const config = {
    bundleId: 'com.hunch.run',
    scheme: 'hunch',
    privyAppId: 'cmiq91u0h006jl70cuyb6az3f',
    keyId: 'DZA3A74VVX',
    
    // REPLACE THESE WITH YOUR ACTUAL VALUES
    teamId: 'REPLACE_ME', // 10 characters from Apple Developer Portal
    servicesId: 'REPLACE_ME', // e.g., com.hunch.run.signin
};

console.log('📋 Current Configuration:');
console.log('-'.repeat(60));
console.log(`Bundle ID (Client ID in Privy): ${config.bundleId}`);
console.log(`Team ID:                        ${config.teamId}`);
console.log(`Key ID:                         ${config.keyId}`);
console.log(`Services ID:                    ${config.servicesId}`);
console.log(`Privy App ID:                   ${config.privyAppId}`);
console.log(`App Scheme:                     ${config.scheme}://`);
console.log();

console.log('✅ Validation Checklist:');
console.log('-'.repeat(60));

// Team ID validation
if (config.teamId === 'REPLACE_ME' || config.teamId.length !== 10) {
    console.log('❌ Team ID: Not configured or invalid (must be 10 characters)');
    console.log('   → Find it at https://developer.apple.com/account (top right)');
} else {
    console.log('✓ Team ID: Looks valid (10 characters)');
}

// Services ID validation  
if (config.servicesId === 'REPLACE_ME' || !config.servicesId.includes('.')) {
    console.log('❌ Services ID: Not configured');
    console.log('   → Create at https://developer.apple.com/account/resources/identifiers/list/serviceId');
} else {
    console.log('✓ Services ID: Configured');
}

console.log();
console.log('🔑 Privy Dashboard Configuration (Copy these values):');
console.log('-'.repeat(60));
console.log();
console.log('1. Go to: https://dashboard.privy.io');
console.log('2. Navigate to: Settings → Login Methods → Social Login → Apple');
console.log('3. Enter these values:');
console.log();
console.log(`   Client ID:    ${config.bundleId}`);
console.log(`   Team ID:      ${config.teamId}`);
console.log(`   Key ID:       ${config.keyId}`);
console.log(`   Private Key:  [Paste entire .p8 file content]`);
console.log();

console.log('🍎 Apple Developer Portal Configuration:');
console.log('-'.repeat(60));
console.log();
console.log(`1. App ID: ${config.bundleId}`);
console.log('   → https://developer.apple.com/account/resources/identifiers/list');
console.log('   → Enable "Sign in with Apple"');
console.log();
console.log(`2. Services ID: ${config.servicesId}`);
console.log('   → https://developer.apple.com/account/resources/identifiers/list/serviceId');
console.log('   → Enable "Sign in with Apple"');
console.log('   → Configure:');
console.log(`      - Primary App ID: ${config.bundleId}`);
console.log('      - Domains: auth.privy.io');
console.log('      - Return URLs: https://auth.privy.io/api/v1/oauth/callback');
console.log();
console.log(`3. Key: ${config.keyId}`);
console.log('   → https://developer.apple.com/account/resources/authkeys/list');
console.log('   → Verify "Sign in with Apple" is enabled');
console.log();

console.log('⚠️  Common Mistakes:');
console.log('-'.repeat(60));
console.log('❌ Using Services ID as Client ID in Privy (should be Bundle ID)');
console.log('❌ Missing Services ID in Apple Developer Portal');
console.log('❌ Wrong Return URL (missing https://, extra slash, etc.)');
console.log('❌ Domain in Services ID doesn\'t include auth.privy.io');
console.log('❌ Private key pasted without BEGIN/END lines');
console.log('❌ Wrong Team ID (not matching your Apple Developer account)');
console.log();

console.log('🔄 After updating configuration:');
console.log('-'.repeat(60));
console.log('1. Wait 10-15 minutes for Apple changes to propagate');
console.log('2. Reload your Expo app (press R in terminal)');
console.log('3. Try Apple Sign In again');
console.log();
console.log('='.repeat(60));
