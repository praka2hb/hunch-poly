/**
 * Minimal shim for Node's `crypto` module in React Native.
 *
 * @polymarket/builder-signing-sdk imports Node crypto for HMAC signing,
 * but in our app all builder HMAC signing is done server-side via
 * /api/polymarket/sign. We only use BuilderConfig with remoteBuilderConfig
 * on the client, so the local crypto functions are never actually called.
 *
 * This shim satisfies the `require("crypto")` at bundle time without
 * pulling in a full Node crypto polyfill.
 */

const createHmac = (algorithm, key) => {
  let data = '';
  return {
    update(input) { data += input; return this; },
    digest(encoding) {
      // Should never be called — HMAC signing is server-side
      console.warn('[crypto-shim] createHmac().digest() called — this should not happen in RN');
      return encoding === 'hex' ? '0'.repeat(64) : Buffer.alloc(32);
    },
  };
};

const createHash = (algorithm) => {
  let data = '';
  return {
    update(input) { data += input; return this; },
    digest(encoding) {
      console.warn('[crypto-shim] createHash().digest() called — this should not happen in RN');
      return encoding === 'hex' ? '0'.repeat(64) : Buffer.alloc(32);
    },
  };
};

const randomBytes = (size) => {
  const bytes = new Uint8Array(size);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  }
  return Buffer.from(bytes);
};

module.exports = {
  createHmac,
  createHash,
  randomBytes,
};
module.exports.default = module.exports;
