# Polymarket Trading Onboarding — Full Setup Flow

## Plan

**TL;DR** — Add a 4-step Polymarket wallet onboarding flow (derive Safe, deploy Safe, set approvals, derive API credentials) triggered when a user first attempts to trade. The backend gets 5 new onboarding API routes under `/api/onboarding/*` plus a builder signing endpoint at `/api/polymarket/sign`. The Expo app gets a full-screen wallet setup modal shown at trade time. Existing `clobApi*` fields on the User model are reused for credential storage; new fields track Safe address and onboarding progress. The existing `/api/polymarket/derive-key` and `/api/polymarket/approval` routes are replaced. Order route updates are a separate task.

---

### Steps

**1. Prisma Schema Migration**

Add fields to the `User` model in [hunch-webapp/prisma/schema.prisma](hunch-webapp/prisma/schema.prisma):
- `safeAddress String?` — derived Gnosis Safe address
- `safeDeployed Boolean @default(false)`
- `approvalsSet Boolean @default(false)`
- `polymarketOnboardingStep Int @default(0)` — 0=not started, 1=safe derived, 2=deployed, 3=approvals set, 4=complete
- `polymarketCredentialsCreatedAt DateTime?`

Keep the existing `clobApiKey`, `clobApiSecret`, `clobApiPassphrase` fields as-is — they become the credential storage for step 4. No rename needed.

Run `prisma migrate dev` to generate and apply the migration.

**2. Backend Constants & Encryption Helpers**

Create [hunch-webapp/app/lib/polymarket-constants.ts](hunch-webapp/app/lib/polymarket-constants.ts):
- Export all 5 Polygon contract addresses (`USDC_E_ADDRESS`, `CTF_CONTRACT`, `CTF_EXCHANGE`, `NEG_RISK_CTF_EXCHANGE`, `NEG_RISK_ADAPTER`)
- Export chain config (Polygon chain ID `137`, RPC URL from `ALCHEMY_POLYGON_RPC` env var)

Create [hunch-webapp/app/lib/encryption.ts](hunch-webapp/app/lib/encryption.ts):
- `encrypt(plaintext: string): string` — AES-256-GCM using `CREDENTIALS_ENCRYPTION_KEY` from env
- `decrypt(ciphertext: string): string` — reverse
- Prepend the IV to the ciphertext, encode as base64 for storage
- Used to encrypt/decrypt the 3 credential fields before storage and when reading them for order submission

**3. Backend Route — POST /api/onboarding/derive-safe**

Create [hunch-webapp/app/api/onboarding/derive-safe/route.ts](hunch-webapp/app/api/onboarding/derive-safe/route.ts):
- Auth via `getAuthenticatedUser(request)` (same pattern as [existing routes](hunch-webapp/app/api/trades/route.ts))
- Call `deriveSafe(authUser.walletAddress)` from `@polymarket/builder-relayer-client`
- Guard: if `polymarketOnboardingStep >= 1`, return existing `safeAddress` early (idempotent)
- `prisma.user.update` — set `safeAddress`, `polymarketOnboardingStep = 1`
- Return `{ safeAddress }`

**4. Backend Route — POST /api/onboarding/deploy-safe**

Create [hunch-webapp/app/api/onboarding/deploy-safe/route.ts](hunch-webapp/app/api/onboarding/deploy-safe/route.ts):
- Auth required
- Body: `{ success: boolean, transactionHash?: string }` — the client has already called `relayClient.deploy()` and is reporting the result
- Guard: require `polymarketOnboardingStep >= 1` (Safe must be derived first)
- Guard idempotent: if `safeDeployed === true`, return early
- `prisma.user.update` — set `safeDeployed = true`, `polymarketOnboardingStep = 2`
- Return `{ success: true, safeAddress }`

**5. Backend Route — POST /api/onboarding/set-approvals**

Create [hunch-webapp/app/api/onboarding/set-approvals/route.ts](hunch-webapp/app/api/onboarding/set-approvals/route.ts):
- Auth required
- Body: `{ success: boolean, transactionHash?: string }` — client already executed the batch approval via `relayClient.execute()`
- Guard: require `polymarketOnboardingStep >= 2`
- Guard idempotent: if `approvalsSet === true`, return early
- `prisma.user.update` — set `approvalsSet = true`, `polymarketOnboardingStep = 3`
- Return `{ success: true }`

**6. Backend Route — POST /api/onboarding/save-credentials**

Create [hunch-webapp/app/api/onboarding/save-credentials/route.ts](hunch-webapp/app/api/onboarding/save-credentials/route.ts):
- Auth required
- Body: `{ key: string, secret: string, passphrase: string }`
- Validate all 3 are non-empty strings
- Encrypt each using `encrypt()` from the encryption helper
- `prisma.user.update` — set `clobApiKey`, `clobApiSecret`, `clobApiPassphrase` (encrypted), `polymarketCredentialsCreatedAt = new Date()`, `polymarketOnboardingStep = 4`
- Return `{ success: true }`

**7. Backend Route — GET /api/onboarding/status**

Create [hunch-webapp/app/api/onboarding/status/route.ts](hunch-webapp/app/api/onboarding/status/route.ts):
- Auth required
- Fetch user from DB with relevant fields
- Return `{ step: polymarketOnboardingStep, safeAddress, safeDeployed, approvalsSet, credentialsReady: !!clobApiKey }`

**8. Backend Route — POST /api/polymarket/sign (Builder Signing)**

Create [hunch-webapp/app/api/polymarket/sign/route.ts](hunch-webapp/app/api/polymarket/sign/route.ts):
- No user auth (called by Expo app during trading, not onboarding) — but apply basic rate limiting (e.g., check origin header or add a simple token)
- Body: `{ method: string, path: string, body?: string }`
- Import `buildHmacSignature` from `@polymarket/builder-signing-sdk`
- Use `POLYMARKET_BUILDER_API_KEY`, `POLYMARKET_BUILDER_SECRET`, `POLYMARKET_BUILDER_PASSPHRASE` from env
- Generate HMAC signature for the request params
- Return `{ POLY_BUILDER_SIGNATURE, POLY_BUILDER_TIMESTAMP, POLY_BUILDER_API_KEY, POLY_BUILDER_PASSPHRASE }` (NOT the secret — only the computed signature)

**9. Deprecate Existing Routes**

Update [hunch-webapp/app/api/polymarket/derive-key/route.ts](hunch-webapp/app/api/polymarket/derive-key/route.ts):
- Keep for backward compat during transition, but add a comment marking it deprecated
- New flow uses client-side `ClobClient.deriveApiKey()` → `POST /api/onboarding/save-credentials`

Update [hunch-webapp/app/api/polymarket/approval/route.ts](hunch-webapp/app/api/polymarket/approval/route.ts):
- Same — mark deprecated. New flow handles approvals via Safe relay on the client, confirmed via `POST /api/onboarding/set-approvals`

**10. Install Backend Dependencies**

In [hunch-webapp/package.json](hunch-webapp/package.json):
- `@polymarket/builder-relayer-client` — for `deriveSafe()` in step 1
- `@polymarket/builder-signing-sdk` — for `buildHmacSignature()` in the sign endpoint
- `@polymarket/clob-client` — not strictly needed on backend for this plan (client-side derivation), but useful for future order route updates
- `ethers@5` — required by the Polymarket packages

**11. Add Environment Variables**

Add to the backend `.env`:
- `POLYMARKET_BUILDER_API_KEY` — from polymarket.com/settings?tab=builder
- `POLYMARKET_BUILDER_SECRET`
- `POLYMARKET_BUILDER_PASSPHRASE`
- `CREDENTIALS_ENCRYPTION_KEY` — 32-byte hex string for AES-256-GCM

**12. Expo — API Client Updates**

Update [hunch-jup/lib/api.ts](hunch-jup/lib/api.ts) to add methods to the `api` object:
- `getOnboardingStatus()` → `GET /api/onboarding/status` (authenticated)
- `deriveSafe()` → `POST /api/onboarding/derive-safe` (authenticated)
- `confirmSafeDeployed(txHash)` → `POST /api/onboarding/deploy-safe` (authenticated)
- `confirmApprovalsSet(txHash)` → `POST /api/onboarding/set-approvals` (authenticated)
- `savePolymarketCredentials({ key, secret, passphrase })` → `POST /api/onboarding/save-credentials` (authenticated)
- `getBuilderSignature({ method, path, body })` → `POST /api/polymarket/sign` (unauthenticated fetch)

**13. Expo — Polymarket Client Helpers**

Create [hunch-jup/lib/polymarketClient.ts](hunch-jup/lib/polymarketClient.ts):
- `getRelayClient(privyProvider, safeAddress)` — initializes `RelayClient` from `@polymarket/builder-relayer-client` with the Privy embedded wallet as signer and builder config pointing to `/api/polymarket/sign` via `remoteBuilderConfig`
- `buildApprovalTransactions()` — returns the 7 approval transaction objects (4 ERC-20 USDC approvals + 3 ERC-1155 approvals) using contract addresses from constants
- `deriveOrCreateApiKey(privyProvider)` — initializes `ClobClient` with Privy signer, tries `deriveApiKey()`, falls back to `createApiKey()`, returns `{ key, secret, passphrase }`
- Contract address constants (same as backend: `USDC_E_ADDRESS`, `CTF_CONTRACT`, `CTF_EXCHANGE`, `NEG_RISK_CTF_EXCHANGE`, `NEG_RISK_ADAPTER`)

**14. Expo — Install Dependencies**

In [hunch-jup/package.json](hunch-jup/package.json):
- `@polymarket/builder-relayer-client` — for RelayClient (deploy, execute approvals)
- `@polymarket/clob-client` — for ClobClient (deriveApiKey/createApiKey)
- `ethers@5` — required by Polymarket packages (ethers v5, NOT v6)

Note: ensure `@ethersproject/shims` (already installed) is imported early in [entrypoint.js](hunch-jup/entrypoint.js) to polyfill Node.js globals for React Native.

**15. Expo — Wallet Setup Screen**

Create [hunch-jup/app/onboarding/wallet-setup.tsx](hunch-jup/app/onboarding/wallet-setup.tsx):

**Structure**: Full-screen modal with 4 steps. Uses the same UI patterns as [username.tsx](hunch-jup/app/onboarding/username.tsx) (SafeAreaView, animated transitions, styled buttons).

**State management**:
- `currentStep` (1–4), initialized from `GET /api/onboarding/status` on mount
- `isLoading`, `error` per step
- `safeAddress` stored locally after step 1

**Progress indicator**: 4 horizontal dots at top — completed = filled (green/primary), current = pulsing, future = outline. No step numbers.

**Step 1 — "Setting up your wallet"**: Auto-fires on mount (no button). Calls `api.deriveSafe()`. On success, stores `safeAddress`, auto-advances to step 2. Shows a spinner inline.

**Step 2 — "Activate your wallet"**: Shows "Activate Wallet" button. On tap:
1. Get Privy wallet via `useEmbeddedEthereumWallet()` (already used throughout the app)
2. Initialize `RelayClient` via `getRelayClient(provider, safeAddress)`
3. Call `relayClient.deploy()` — Privy will prompt for signature
4. On success call `api.confirmSafeDeployed(txHash)`
5. Advance to step 3

**Step 3 — "Enable trading"**: Shows "Enable Trading" button. On tap:
1. Build 7 approval txs via `buildApprovalTransactions()`
2. Call `relayClient.execute(approvalTxs)` — Privy prompts for signature
3. On success call `api.confirmApprovalsSet(txHash)`
4. Advance to step 4

**Step 4 — "Connect to markets"**: Shows "Connect" button. On tap:
1. Initialize `ClobClient` via `deriveOrCreateApiKey(provider)`
2. Privy prompts for EIP-712 signature
3. Send resulting `{ key, secret, passphrase }` to `api.savePolymarketCredentials()`
4. Show success state with checkmark animation
5. Dismiss modal / navigate back to the trade screen that triggered it

**Error handling**: Each step shows inline error below the description with a retry button. Error messages:
- Signature rejected → "Signature required to continue"
- Network error → "Connection failed, tap to retry"
- Timeout → "Taking longer than expected, tap to retry"

**Resumability**: On mount, `getOnboardingStatus()` response determines `currentStep`. Completed steps show as done. User never repeats finished steps.

**16. Expo — Register Screen in Navigation**

Update [hunch-jup/app/_layout.tsx](hunch-jup/app/_layout.tsx):
- Add `<Stack.Screen name="onboarding/wallet-setup" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />` — `gestureEnabled: false` prevents swipe-dismiss mid-flow

**17. Expo — Trade Gate Integration**

Update [hunch-jup/components/MarketTradeSheet.tsx](hunch-jup/components/MarketTradeSheet.tsx) (and any other trade entry points):
- Before allowing a trade action, check `backendUser.polymarketOnboardingStep < 4`
- If incomplete, navigate to `onboarding/wallet-setup` instead of proceeding with the trade
- After wallet setup completes and navigates back, refresh user data via `syncUserWithBackend()` and proceed

Update the `User` type in [hunch-jup/contexts/UserContext.tsx](hunch-jup/contexts/UserContext.tsx):
- Add `safeAddress?: string`, `safeDeployed?: boolean`, `approvalsSet?: boolean`, `polymarketOnboardingStep?: number` to the `User` interface (or wherever the backend user type is defined)

**18. Expo — User API Response Update**

Ensure the backend user sync/fetch endpoints return the new fields. Update:
- [hunch-webapp/app/api/users/sync/route.ts](hunch-webapp/app/api/users/sync/route.ts) — include new fields in the response
- [hunch-webapp/app/lib/userService.ts](hunch-webapp/app/lib/userService.ts) — if it selects specific fields, add the new ones
- [hunch-webapp/app/api/auth/bootstrap-oauth-user/route.ts](hunch-webapp/app/api/auth/bootstrap-oauth-user/route.ts) — same

---

### Verification

1. **Schema migration**: `npx prisma migrate dev` succeeds, `npx prisma generate` produces updated client types
2. **Backend route tests**: Use curl/Postman to test each onboarding route sequentially:
   - `POST /api/onboarding/derive-safe` → returns `safeAddress`, user step becomes 1
   - `POST /api/onboarding/deploy-safe` → returns success, step becomes 2
   - `POST /api/onboarding/set-approvals` → returns success, step becomes 3
   - `POST /api/onboarding/save-credentials` → returns success, step becomes 4
   - `GET /api/onboarding/status` → reflects correct state at each point
3. **Builder signing**: `POST /api/polymarket/sign` with sample `{ method: "GET", path: "/test" }` → returns valid HMAC headers (verify format matches Polymarket's builder SDK expectations)
4. **Encryption round-trip**: Verify `encrypt(decrypt(value)) === value` for credential storage
5. **Expo flow**: Launch app, complete social onboarding, tap a trade button → wallet setup modal appears → complete all 4 steps → modal dismisses → trade button works normally
6. **Resumability**: Kill app mid-step-2, reopen, tap trade → modal resumes at step 2
7. **Idempotency**: Call each backend route twice → second call returns same result without error
8. **Error states**: Reject Privy signature prompts → verify inline error appears with retry button

---

### Decisions

- **Field naming**: Reuse existing `clobApiKey/Secret/Passphrase` for credential storage rather than adding new `polymarketApi*` fields — avoids schema bloat and migration of existing data
- **Route strategy**: New `/api/onboarding/*` routes replace old `/api/polymarket/derive-key` and `/api/polymarket/approval` — old routes marked deprecated but left functional during transition
- **Trade gating**: Wallet setup modal triggered at trade time (not after social onboarding) — lighter UX, users who never trade don't see it
- **Order route**: Updating `/api/polymarket/order` to use builder pattern is a separate follow-up task
- **Encryption**: Added encryption layer for credentials — existing `clobApi*` fields are plaintext today; new save-credentials route encrypts before storing. The order route will need a corresponding decrypt when reading them (part of the order route follow-up)
