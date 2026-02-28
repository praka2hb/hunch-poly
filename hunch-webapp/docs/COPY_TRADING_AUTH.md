# Copy Trading Authentication Model

This document describes the three-layer authentication model for copy trading in Hunch.

## Overview

Copy trading allows followers to automatically replicate the trades of leaders they follow. This requires secure authorization at multiple levels.

## Three-Layer Auth Model

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Global App Key (Server-Side)                       │
│ PRIVY_AUTHORIZATION_PRIVATE_KEY                             │
│ → Enables server to sign Solana transactions                │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Per-Follower Delegation                            │
│ User.delegationSignature + delegationSignedAt               │
│ → User consent to allow Hunch to trade on their behalf      │
│ → One-time setup, valid for ALL leaders                     │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Per-Leader Copy Settings                           │
│ CopySettings (followerId, leaderId)                         │
│ → Budget limits: amountPerTrade, maxTotalAmount             │
│ → Enabled/disabled, expiry                                  │
└─────────────────────────────────────────────────────────────┘
```

## Layer Details

### Layer 1: Global App Key

- **Location**: `PRIVY_AUTHORIZATION_PRIVATE_KEY` in environment variables
- **Purpose**: Allows the backend to sign Solana transactions via Privy's server-side signing
- **Scope**: App-wide, not per-user
- **Lifecycle**: Permanent, managed by Hunch infrastructure

### Layer 2: Per-Follower Delegation

- **Location**: `User.delegationSignature`, `User.delegationMessage`, `User.delegationSignedAt`
- **Purpose**: User consent authorizing Hunch to execute trades on their behalf
- **Scope**: Per-follower (not per-leader)
- **Lifecycle**: 
  - Created when user first enables copy trading
  - Persists across multiple leaders
  - NOT revoked on unfollow - stays valid
  - Can be explicitly revoked via `revokeDelegation()`

### Layer 3: Per-Leader Copy Settings

- **Location**: `CopySettings` table (keyed by `followerId` + `leaderId`)
- **Purpose**: Budget and control settings for each leader
- **Scope**: Per follower-leader pair
- **Lifecycle**:
  - Created when follower enables copy for a specific leader
  - Deleted when follower unfollows the leader
  - Can be enabled/disabled independently

## API Authentication

All copy trading endpoints require Privy JWT authentication:

| Endpoint | Auth | Body Fields |
|----------|------|-------------|
| `POST /api/copy-settings` | Required (Bearer token) | `leaderId`, `amountPerTrade`, `maxTotalAmount`, `delegationSignature?` |
| `GET /api/copy-settings` | Required | Query: `leaderId?` |
| `DELETE /api/copy-settings` | Required | `leaderId` |
| `POST /api/copy/execute` | QStash signature | (internal) |

**Note**: `followerId` is NEVER accepted from the client. It's always derived from the authenticated Privy session.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_TOKEN` | 401 | No auth token provided |
| `INVALID_TOKEN` | 401 | Token expired or invalid |
| `USER_NOT_FOUND` | 401 | User not synced to database |
| `DELEGATION_REQUIRED` | 403 | No delegation signature on file |
| `NO_DELEGATION` | 200 (skipped) | Copy trade skipped due to missing delegation |

## Flows

### Enable Copy Trading for a Leader

1. Client shows delegation consent UI
2. User signs message with wallet
3. Client calls `POST /api/copy-settings` with:
   - `leaderId`
   - `amountPerTrade`, `maxTotalAmount`
   - `delegationSignature`, `signedMessage` (first time only)
4. Backend stores delegation on `User` if new
5. Backend creates/updates `CopySettings` row

### Unfollow a Leader

1. Client calls `DELETE /api/follow` with `followingId`
2. Backend removes follow relationship
3. Backend deletes `CopySettings` for that leader
4. User delegation remains intact (can copy other leaders)

### Copy Trade Execution

1. Leader places trade → triggers QStash job
2. `/api/copy/execute` receives job
3. Checks:
   - ✓ Leader trade exists
   - ✓ CopySettings exists and enabled
   - ✓ Not expired
   - ✓ **Delegation is valid** (new check)
   - ✓ Within budget
4. If all pass → execute trade via Privy server-side signing
