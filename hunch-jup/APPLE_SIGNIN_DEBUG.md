# Apple Sign In Configuration Checklist

## Current Status
✅ iOS app opens Apple Sign In  
✅ User authenticates successfully  
✅ Authorization code is returned  
❌ **Privy backend can't exchange code with Apple** ← YOU ARE HERE

---

## Critical Configuration Points

### 1. Apple Developer Portal - App ID
**Location**: https://developer.apple.com/account/resources/identifiers/list

- [ ] App ID: `com.hunch.run` exists
- [ ] "Sign in with Apple" capability is **ENABLED**
- [ ] Configure button shows it as **"Primary App ID"**

---

### 2. Apple Developer Portal - Services ID
**Location**: https://developer.apple.com/account/resources/identifiers/list/serviceId

**CRITICAL**: You MUST have a Services ID even though you use Bundle ID in Privy!

- [ ] Services ID exists (e.g., `com.hunch.run.signin` or `com.hunch.run.service`)
- [ ] "Sign in with Apple" is **CHECKED/ENABLED**
- [ ] Click "Configure" next to "Sign in with Apple":
  - [ ] **Primary App ID**: Selected `com.hunch.run`
  - [ ] **Domains and Subdomains**: Contains `auth.privy.io`
  - [ ] **Return URLs**: Contains exactly:
    ```
    https://auth.privy.io/api/v1/oauth/callback
    ```
    ⚠️ Must be HTTPS, no trailing slash, exact match

---

### 3. Apple Developer Portal - Key
**Location**: https://developer.apple.com/account/resources/authkeys/list

- [ ] Key ID `DZA3A74VVX` exists
- [ ] "Sign in with Apple" is enabled for this key
- [ ] Note your **Team ID** (10 characters, top-right corner of portal)

---

### 4. Privy Dashboard Configuration
**Location**: https://dashboard.privy.io
**Path**: Your App → Settings → Login Methods → Social Login → Apple

**Enter EXACTLY these values:**

```
Client ID:    com.hunch.run
              ↑ YOUR BUNDLE ID (NOT Services ID)

Team ID:      [YOUR-10-CHAR-TEAM-ID]
              ↑ From Apple Developer Portal (top right)

Key ID:       DZA3A74VVX
              ↑ From your AuthKey filename

Private Key:  -----BEGIN PRIVATE KEY-----
              MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg9rkPVfvjoSjXCXqG
              9Jllmhlat75utSQmZXVIP4/U+zGgCgYIKoZIzj0DAQehRANCAAR7G3+bC8MFDIU7
              tCGqfxugK/hVvvbyduUlZCjkiaZl8QbTRtcZ3AQ7UjYIxTb06ZgbBRJnzoF6MOkD
              1ZAtoa3K
              -----END PRIVATE KEY-----
              ↑ Entire content including BEGIN/END lines
              ↑ Remove any extra spaces or line breaks
```

---

### 5. Privy Dashboard - Redirect URIs
**Location**: https://dashboard.privy.io
**Path**: Your App → Settings → Redirect/Allowed origins

- [ ] Contains: `hunch://`

---

## Most Likely Issues

### Issue #1: Services ID Not Configured (MOST COMMON)
Even though you use Bundle ID as Client ID in Privy, Apple still requires a Services ID for the OAuth flow.

**Fix:**
1. Create Services ID: `com.hunch.run.signin`
2. Enable "Sign in with Apple"
3. Configure with:
   - Primary App ID: `com.hunch.run`
   - Domain: `auth.privy.io`
   - Return URL: `https://auth.privy.io/api/v1/oauth/callback`

### Issue #2: Wrong Team ID
The Team ID in Privy must match your Apple Developer account.

**Find your Team ID:**
- Log in to https://developer.apple.com/account
- Look at top-right corner: Team Name (XXXXXXXXXX) ← 10 characters

### Issue #3: Private Key Format
The private key must be pasted with exact formatting.

**Verify:**
- Starts with `-----BEGIN PRIVATE KEY-----`
- Ends with `-----END PRIVATE KEY-----`
- No extra newlines before BEGIN or after END
- All 5 lines of key content included

### Issue #4: Return URL Mismatch
The Return URL in Apple's Services ID must be EXACT.

**Must be:**
```
https://auth.privy.io/api/v1/oauth/callback
```

**NOT:**
- `https://auth.privy.io/api/v1/oauth/callback/` ← trailing slash
- `http://auth.privy.io/api/v1/oauth/callback` ← http not https
- Different path or domain

---

## Quick Test After Changes

1. **Wait 10-15 minutes** after saving Apple Developer Portal changes
2. Clear app and restart:
   ```bash
   # In Expo terminal, press 'r' to reload
   # Or close and reopen the app
   ```
3. Try Apple Sign In again
4. Check logs for new error details

---

## If Still Failing

Contact Privy Support with these details:
- Privy App ID: `cmiq91u0h006jl70cuyb6az3f`
- Bundle ID: `com.hunch.run`
- Services ID: [your Services ID]
- Team ID: [your Team ID]
- Error: "Unable to exchange oauth code for provider"

They can check server-side logs for the exact failure reason.
