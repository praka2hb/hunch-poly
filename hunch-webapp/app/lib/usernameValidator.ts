/**
 * Username Validation
 *
 * Shared validator used by both /check and /claim endpoints.
 * Returns structured reason codes so the UI can show clear messages.
 */

export type UsernameReasonCode =
    | 'VALID'
    | 'TOO_SHORT'
    | 'TOO_LONG'
    | 'INVALID_CHARACTERS'
    | 'STARTS_WITH_UNDERSCORE'
    | 'CONSECUTIVE_UNDERSCORES'
    | 'RESERVED'
    | 'TAKEN'
    | 'UNAVAILABLE_SYSTEM';

export interface UsernameValidationResult {
    valid: boolean;
    reason: UsernameReasonCode;
    normalizedUsername: string;
}

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
const ALLOWED_PATTERN = /^[a-z0-9_]+$/;
const CONSECUTIVE_UNDERSCORES = /__/;

const RESERVED_USERNAMES = new Set([
    'admin',
    'administrator',
    'support',
    'hunch',
    'api',
    'root',
    'system',
    'null',
    'undefined',
    'test',
    'official',
    'help',
    'info',
    'mod',
    'moderator',
    'staff',
    'bot',
    'webhook',
    'status',
    'about',
    'terms',
    'privacy',
    'settings',
    'profile',
    'dashboard',
    'login',
    'signup',
    'register',
    'auth',
    'account',
    'wallet',
    'trade',
    'market',
    'event',
    'feed',
]);

/**
 * Normalize a username: trim whitespace and lowercase.
 */
export function normalizeUsername(raw: string): string {
    return raw.trim().toLowerCase();
}

/**
 * Validate a username against all rules.
 * Does NOT check database availability — that's the caller's job.
 */
export function validateUsername(raw: string): UsernameValidationResult {
    const normalized = normalizeUsername(raw);

    if (normalized.length < MIN_LENGTH) {
        return { valid: false, reason: 'TOO_SHORT', normalizedUsername: normalized };
    }

    if (normalized.length > MAX_LENGTH) {
        return { valid: false, reason: 'TOO_LONG', normalizedUsername: normalized };
    }

    if (!ALLOWED_PATTERN.test(normalized)) {
        return { valid: false, reason: 'INVALID_CHARACTERS', normalizedUsername: normalized };
    }

    if (normalized.startsWith('_')) {
        return { valid: false, reason: 'STARTS_WITH_UNDERSCORE', normalizedUsername: normalized };
    }

    if (CONSECUTIVE_UNDERSCORES.test(normalized)) {
        return { valid: false, reason: 'CONSECUTIVE_UNDERSCORES', normalizedUsername: normalized };
    }

    if (RESERVED_USERNAMES.has(normalized)) {
        return { valid: false, reason: 'RESERVED', normalizedUsername: normalized };
    }

    return { valid: true, reason: 'VALID', normalizedUsername: normalized };
}

/**
 * Human-readable error messages for each reason code.
 */
export function getReasonMessage(reason: UsernameReasonCode): string {
    switch (reason) {
        case 'TOO_SHORT':
            return `Username must be at least ${MIN_LENGTH} characters.`;
        case 'TOO_LONG':
            return `Username must be at most ${MAX_LENGTH} characters.`;
        case 'INVALID_CHARACTERS':
            return 'Username can only contain letters, numbers, and underscores.';
        case 'STARTS_WITH_UNDERSCORE':
            return 'Username must start with a letter or number.';
        case 'CONSECUTIVE_UNDERSCORES':
            return 'Username cannot contain consecutive underscores.';
        case 'RESERVED':
            return 'This username is reserved.';
        case 'TAKEN':
            return 'This username is already taken.';
        case 'UNAVAILABLE_SYSTEM':
            return 'This username is not available.';
        case 'VALID':
            return 'Username is valid.';
    }
}
