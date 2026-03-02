/**
 * AES-256-GCM encryption utilities for storing sensitive credentials at rest.
 *
 * CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

function getKey(): Buffer {
    const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            'CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
            'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string containing: IV (12 B) + ciphertext + authTag (16 B).
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Pack: IV + encrypted + authTag
    const packed = Buffer.concat([iv, encrypted, authTag]);
    return packed.toString('base64');
}

/**
 * Decrypt a base64 string produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
    const key = getKey();
    const packed = Buffer.from(ciphertext, 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('Invalid ciphertext: too short');
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}
