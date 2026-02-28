/**
 * Onboarding Service
 *
 * Server-side source of truth for:
 * - whether wallet is actually ready
 * - where user is in onboarding
 * - whether username can be claimed (atomically)
 * - whether Apple user should be prompted to link X
 */

import { prisma } from './db';
import { OnboardingStep } from '@prisma/client';
import {
    validateUsername,
    normalizeUsername,
    getReasonMessage,
    type UsernameReasonCode,
} from './usernameValidator';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BootstrapInput {
    privyId: string;
    provider: string; // "apple" | "twitter" | etc.
    linkedAccounts: LinkedAccount[];
    username?: string; // X/Twitter username (without @)
    displayName?: string; // Display name from OAuth provider
}

export interface LinkedAccount {
    type: string; // "wallet" | "twitter_oauth" | "apple_oauth" | etc.
    address?: string; // wallet address (for wallet type)
    [key: string]: unknown;
}

export interface BootstrapResult {
    user: BootstrapUser;
    walletReady: boolean;
    onboardingStep: OnboardingStep;
    isNewUser: boolean;
    retryAfterMs?: number;
}

export interface BootstrapUser {
    id: string;
    privyId: string;
    walletAddress: string;
    displayName: string | null;
    avatarUrl: string | null;
    username: string | null;
    normalizedUsername: string | null;
    onboardingStep: OnboardingStep;
    hasCompletedOnboarding: boolean;
    walletReady: boolean;
    hasLinkedX: boolean;
    authProvider: string | null;
}

export interface UsernameCheckResult {
    username: string;
    normalizedUsername: string;
    available: boolean;
    reason?: UsernameReasonCode;
}

export interface ClaimResult {
    success: boolean;
    user?: BootstrapUser;
    onboardingStep?: OnboardingStep;
    error?: string;
    code?: string;
}

export interface ProgressInput {
    step: string;
    completed?: boolean;
}

export interface ProgressResult {
    onboardingStep: OnboardingStep;
    hasCompletedOnboarding: boolean;
    onboardingUpdatedAt: Date | null;
}

// ─── User select shape (reused across queries) ──────────────────────────────

const BOOTSTRAP_USER_SELECT = {
    id: true,
    privyId: true,
    walletAddress: true,
    displayName: true,
    avatarUrl: true,
    username: true,
    normalizedUsername: true,
    onboardingStep: true,
    hasCompletedOnboarding: true,
    walletReady: true,
    hasLinkedX: true,
    authProvider: true,
} as const;

// ─── Step ordering ──────────────────────────────────────────────────────────

const STEP_ORDER: OnboardingStep[] = [
    'LINK_X',
    'USERNAME',
    'INTERESTS',
    'SUGGESTED_FOLLOWERS',
    'COMPLETE',
];

function stepIndex(step: OnboardingStep): number {
    return STEP_ORDER.indexOf(step);
}

function nextStep(current: OnboardingStep): OnboardingStep {
    const idx = stepIndex(current);
    if (idx === -1 || idx >= STEP_ORDER.length - 1) return 'COMPLETE';
    return STEP_ORDER[idx + 1];
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

/**
 * Idempotent bootstrap for OAuth users.
 *
 * 1. Looks up user by privyId.
 * 2. If not found, creates user skeleton (only if wallet exists in linked accounts).
 * 3. Resolves wallet readiness.
 * 4. Derives onboarding step.
 */
export async function bootstrapOAuthUser(input: BootstrapInput): Promise<BootstrapResult> {
    const { privyId, provider, linkedAccounts, username, displayName } = input;

    // Extract wallet from linked accounts
    const walletAccount = linkedAccounts.find(
        (a) => a.type === 'wallet' && typeof a.address === 'string' && a.address.length > 0
    );
    const walletAddress = walletAccount?.address ?? null;

    // Check for linked X/Twitter
    const hasLinkedX = linkedAccounts.some(
        (a) => a.type === 'twitter_oauth' || a.type === 'twitter'
    );

    // Cannot create user without wallet (schema requires it)
    if (!walletAddress) {
        // Return a synthetic "pending" result so the client can poll
        return {
            user: {
                id: '',
                privyId,
                walletAddress: '',
                displayName: displayName || null,
                avatarUrl: null,
                username: username || null,
                normalizedUsername: username ? normalizeUsername(username) : null,
                onboardingStep: 'LINK_X',
                hasCompletedOnboarding: false,
                walletReady: false,
                hasLinkedX,
                authProvider: provider,
            },
            walletReady: false,
            onboardingStep: 'LINK_X',
            isNewUser: true,
            retryAfterMs: 3000, // suggest client retries in 3s
        };
    }

    // Check if user exists (for isNewUser flag)
    const existingUser = await prisma.user.findUnique({
        where: { privyId },
        select: { id: true },
    });

    // Use upsert to handle both new and existing users atomically
    let user = await prisma.user.upsert({
        where: { privyId },
        create: {
            privyId,
            walletAddress,
            walletReady: true,
            authProvider: provider,
            hasLinkedX,
            onboardingStep: 'LINK_X',
            hasCompletedOnboarding: false,
            username: username || null,
            normalizedUsername: username ? normalizeUsername(username) : null,
            displayName: displayName || null,
        },
        update: {
            authProvider: provider,
            hasLinkedX,
            walletReady: walletAddress ? true : undefined,
            walletAddress: walletAddress || undefined,
            username: username || undefined,
            normalizedUsername: username ? normalizeUsername(username) : undefined,
            displayName: displayName || undefined,
        },
        select: BOOTSTRAP_USER_SELECT,
    });

    const isNewUser = !existingUser;

    // Derive onboarding step
    const step = deriveOnboardingStep(user);

    // Persist derived step if it differs (idempotent)
    if (step !== user.onboardingStep) {
        await prisma.user.update({
            where: { id: user.id },
            data: {
                onboardingStep: step,
                onboardingUpdatedAt: new Date(),
            },
        });
        user = { ...user, onboardingStep: step };
    }

    return {
        user,
        walletReady: user.walletReady,
        onboardingStep: step,
        isNewUser,
    };
}

// ─── Step Derivation ────────────────────────────────────────────────────────

/**
 * Derive the current onboarding step from user state.
 * This is the single source of truth for onboarding routing.
 */
export function deriveOnboardingStep(user: BootstrapUser): OnboardingStep {
    if (user.hasCompletedOnboarding) return 'COMPLETE';

    // If no username yet, they need to be at USERNAME (or LINK_X first)
    if (!user.username) {
        // If Apple user without linked X, prompt LINK_X first (optional/skippable)
        if (user.authProvider === 'apple' && !user.hasLinkedX) {
            return 'LINK_X';
        }
        return 'USERNAME';
    }

    // Has username => continue from persisted step
    // But clamp to at least INTERESTS (they've passed USERNAME)
    const currentIdx = stepIndex(user.onboardingStep);
    const interestsIdx = stepIndex('INTERESTS');
    if (currentIdx < interestsIdx) {
        return 'INTERESTS';
    }

    return user.onboardingStep;
}

// ─── Username Check ─────────────────────────────────────────────────────────

/**
 * Check username availability (public, no auth needed).
 */
export async function checkUsernameAvailability(rawUsername: string): Promise<UsernameCheckResult> {
    const validation = validateUsername(rawUsername);

    if (!validation.valid) {
        return {
            username: rawUsername,
            normalizedUsername: validation.normalizedUsername,
            available: false,
            reason: validation.reason,
        };
    }

    // Check DB
    const existing = await prisma.user.findUnique({
        where: { normalizedUsername: validation.normalizedUsername },
        select: { id: true },
    });

    if (existing) {
        return {
            username: rawUsername,
            normalizedUsername: validation.normalizedUsername,
            available: false,
            reason: 'TAKEN',
        };
    }

    return {
        username: rawUsername,
        normalizedUsername: validation.normalizedUsername,
        available: true,
    };
}

// ─── Username Claim ─────────────────────────────────────────────────────────

/**
 * Atomically claim a username for the authenticated user.
 *
 * Uses a Prisma transaction to prevent race conditions:
 * - If user already owns the same normalized username → idempotent success
 * - If another user owns it → 409 conflict
 * - Otherwise → claim and advance to INTERESTS
 */
export async function claimUsername(
    userId: string,
    rawUsername: string
): Promise<ClaimResult> {
    const validation = validateUsername(rawUsername);

    if (!validation.valid) {
        return {
            success: false,
            error: getReasonMessage(validation.reason),
            code: validation.reason,
        };
    }

    const normalized = validation.normalizedUsername;

    // Atomic transaction
    try {
        const result = await prisma.$transaction(async (tx) => {
            // Check current user
            const currentUser = await tx.user.findUnique({
                where: { id: userId },
                select: { normalizedUsername: true },
            });

            if (!currentUser) {
                throw new ClaimError('User not found.', 'USER_NOT_FOUND', 404);
            }

            // Idempotent: same user, same username
            if (currentUser.normalizedUsername === normalized) {
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    select: BOOTSTRAP_USER_SELECT,
                });
                return { user: user!, alreadyOwned: true };
            }

            // Check if username is taken by someone else
            const holder = await tx.user.findUnique({
                where: { normalizedUsername: normalized },
                select: { id: true },
            });

            if (holder && holder.id !== userId) {
                throw new ClaimError('Username is already taken.', 'TAKEN', 409);
            }

            // Claim it + advance step
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: {
                    username: rawUsername.trim(),
                    normalizedUsername: normalized,
                    onboardingStep: 'INTERESTS',
                    onboardingUpdatedAt: new Date(),
                },
                select: BOOTSTRAP_USER_SELECT,
            });

            return { user: updatedUser, alreadyOwned: false };
        });

        return {
            success: true,
            user: result.user,
            onboardingStep: result.user.onboardingStep,
        };
    } catch (error) {
        if (error instanceof ClaimError) {
            return {
                success: false,
                error: error.message,
                code: error.code,
            };
        }
        // Prisma unique constraint violation (P2002) — race condition fallback
        if (isP2002(error)) {
            return {
                success: false,
                error: 'Username is already taken.',
                code: 'TAKEN',
            };
        }
        throw error;
    }
}

class ClaimError extends Error {
    public code: string;
    public statusCode: number;
    constructor(message: string, code: string, statusCode: number) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}

function isP2002(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
    );
}

// ─── Onboarding Progress ───────────────────────────────────────────────────

/**
 * Advance or complete onboarding step.
 */
export async function advanceOnboardingStep(
    userId: string,
    input: ProgressInput
): Promise<ProgressResult> {
    const { step, completed } = input;

    // Validate step is a valid enum value
    if (!STEP_ORDER.includes(step as OnboardingStep)) {
        throw new OnboardingError(
            `Invalid onboarding step: ${step}. Must be one of: ${STEP_ORDER.join(', ')}`,
            'INVALID_STEP',
            422
        );
    }

    const targetStep = step as OnboardingStep;

    // If completing onboarding
    const isCompleting = completed === true || targetStep === 'COMPLETE';

    const data: Record<string, unknown> = {
        onboardingStep: isCompleting ? 'COMPLETE' : targetStep,
        hasCompletedOnboarding: isCompleting ? true : undefined,
        onboardingUpdatedAt: new Date(),
    };

    // Remove undefined values
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const updated = await prisma.user.update({
        where: { id: userId },
        data,
        select: {
            onboardingStep: true,
            hasCompletedOnboarding: true,
            onboardingUpdatedAt: true,
        },
    });

    return updated;
}

export class OnboardingError extends Error {
    public code: string;
    public statusCode: number;
    constructor(message: string, code: string, statusCode: number) {
        super(message);
        this.name = 'OnboardingError';
        this.code = code;
        this.statusCode = statusCode;
    }
}
