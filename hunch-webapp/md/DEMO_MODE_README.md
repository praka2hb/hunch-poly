# 🎭 Demo Mode - Temporary API Fallback

## Overview
While the DFlow API is down, the app uses demo data to display sample events and markets on the Home page.

## Demo Events Included
1. **Bitcoin $150k Prediction** - Crypto market with Q1 and Q2 timeframes
2. **GPT-5 Release** - AI/Tech prediction with H1 and full-year markets
3. **Argentina World Cup** - Sports prediction with top-4 and championship markets

Each event has 2-3 nested markets with realistic pricing and volume data.

## How to Disable Demo Mode

### Quick Method
Set `USE_DEMO_DATA` to `false` in the demo data file:

```typescript
// app/lib/demoData.ts
export const USE_DEMO_DATA = false; // Change to false
```

### Complete Removal (When API is Back)

1. **Delete the demo data file:**
   ```
   app/lib/demoData.ts
   ```

2. **Remove imports from EventsList:**
   In `app/components/EventsList.tsx`, remove these lines:
   ```typescript
   // Line ~9-11
   // ===== DEMO DATA IMPORT - REMOVE WHEN API IS BACK =====
   import { USE_DEMO_DATA, DEMO_EVENTS } from '../lib/demoData';
   // ======================================================
   ```

3. **Remove demo data logic:**
   In `app/components/EventsList.tsx`, remove these sections:

   - **In useEffect (~line 430):**
     ```typescript
     // ===== USE DEMO DATA IF ENABLED =====
     if (USE_DEMO_DATA) { ... }
     // ====================================
     ```

   - **In loadMoreEvents (~line 460):**
     ```typescript
     // ===== DEMO MODE: NO PAGINATION =====
     if (USE_DEMO_DATA) return;
     // ====================================
     ```

   - **In return statement (~line 595):**
     ```typescript
     {/* ===== DEMO MODE BANNER - REMOVE WHEN API IS BACK ===== */}
     {USE_DEMO_DATA && ( ... )}
     {/* ====================================================== */}
     ```

4. **Test the app** to ensure the real API is working correctly.

## Visual Indicator
When demo mode is active, users will see a yellow banner at the top of the events list indicating "Demo Mode Active" with instructions.

## Files Modified
- ✅ `app/lib/demoData.ts` (new file - contains demo events)
- ✅ `app/components/EventsList.tsx` (modified - uses demo data when flag is true)
- ✅ `app/components/OrderModal.tsx` (modified - new pill selection UI)

## Notes
- Demo data matches the real API structure (Event and Market types)
- All demo ticker IDs are prefixed with "DEMO-" to avoid conflicts
- Markets have realistic bid/ask spreads and volumes
- The OrderModal redesign works with both real and demo data
