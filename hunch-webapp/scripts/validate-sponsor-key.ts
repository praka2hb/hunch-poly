
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';
dotenv.config();

const EXPECTED_PUBLIC_KEY = '7kTQprvYD4QFsAbDZJkeb7tbCJW3KdKhRMX2Q4gUiRj1';
const configuredKey = process.env.SPONSOR_PRIVATE_KEY_BASE58;

console.log(`\n--- Sponsor Key Validation ---`);

if (!configuredKey) {
    console.error("❌ ERROR: SPONSOR_PRIVATE_KEY_BASE58 is missing from .env");
    process.exit(1);
}

try {
    const secretKey = bs58.decode(configuredKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKey = keypair.publicKey.toBase58();

    console.log(`Configured Public Key: ${publicKey}`);
    console.log(`Expected Public Key:   ${EXPECTED_PUBLIC_KEY}`);

    if (publicKey === EXPECTED_PUBLIC_KEY) {
        console.log("✅ SUCCESS: Keys match!");
    } else {
        console.error("❌ ERROR: Keys DO NOT match!");
        console.error("The private key in .env belongs to a different wallet.");
    }

} catch (e: any) {
    console.error(`❌ ERROR: Invalid private key format: ${e.message}`);
}
