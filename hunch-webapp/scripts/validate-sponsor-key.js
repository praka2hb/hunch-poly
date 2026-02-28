"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var web3_js_1 = require("@solana/web3.js");
var bs58_1 = require("bs58");
var dotenv = require("dotenv");
dotenv.config();
var EXPECTED_PUBLIC_KEY = '7kTQprvYD4QFsAbDZJkeb7tbCJW3KdKhRMX2Q4gUiRj1';
var configuredKey = process.env.SPONSOR_PRIVATE_KEY_BASE58;
console.log("\n--- Sponsor Key Validation ---");
if (!configuredKey) {
    console.error("❌ ERROR: SPONSOR_PRIVATE_KEY_BASE58 is missing from .env");
    process.exit(1);
}
try {
    var secretKey = bs58_1.default.decode(configuredKey);
    var keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
    var publicKey = keypair.publicKey.toBase58();
    console.log("Configured Public Key: ".concat(publicKey));
    console.log("Expected Public Key:   ".concat(EXPECTED_PUBLIC_KEY));
    if (publicKey === EXPECTED_PUBLIC_KEY) {
        console.log("✅ SUCCESS: Keys match!");
    }
    else {
        console.error("❌ ERROR: Keys DO NOT match!");
        console.error("The private key in .env belongs to a different wallet.");
    }
}
catch (e) {
    console.error("\u274C ERROR: Invalid private key format: ".concat(e.message));
}
