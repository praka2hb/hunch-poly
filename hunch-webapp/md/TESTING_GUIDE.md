# Testing Guide - Dummy Trade with Quotes

## 🎯 Quick Start

Your dummy trade system is now fully deployed and ready to test!

## ✅ Pre-Test Checklist

- [x] Database migration completed
- [x] Prisma client generated
- [x] All code files updated
- [x] Environment variables configured

## 🧪 Test Scenarios

### Test 1: Place Trade Without Quote
**Steps:**
1. Navigate to an event detail page (e.g., `/event/[eventId]`)
2. Select a market
3. Choose YES or NO position
4. Enter an amount (e.g., 10 USDC)
5. Click "Place Order"
6. When the quote modal appears, click "Skip"

**Expected Result:**
- ✅ Trade created in database with `isDummy=true`
- ✅ Quote field is `null`
- ✅ Success message displayed
- ✅ Form cleared

**Verification:**
```sql
SELECT * FROM "Trade" WHERE "isDummy" = true ORDER BY "createdAt" DESC LIMIT 1;
-- Should show: quote = NULL, isDummy = true
```

---

### Test 2: Place Trade With Quote
**Steps:**
1. Navigate to an event detail page
2. Select a market and position
3. Enter an amount
4. Click "Place Order"
5. In the quote modal, type: "I think this will happen because..."
6. Click "Share Trade"

**Expected Result:**
- ✅ Trade created with quote saved
- ✅ Quote appears in followers' social feed
- ✅ Trade card has gradient border and speech bubble icon
- ✅ "Prediction" badge visible

**Verification:**
```sql
SELECT "quote", "isDummy" FROM "Trade" WHERE "quote" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1;
-- Should show your quote text
```

---

### Test 3: Quote Character Limit
**Steps:**
1. Start placing a trade
2. In quote modal, type more than 280 characters
3. Observe character counter

**Expected Result:**
- ✅ Counter turns yellow at 20 chars remaining
- ✅ Counter turns red when over limit
- ✅ "Share Trade" button disabled when over limit
- ✅ Can still click "Skip"

---

### Test 4: Social Feed Display
**Steps:**
1. Have User A follow User B
2. User B places a trade with quote: "This is my prediction!"
3. User A navigates to `/social` page
4. Check feed

**Expected Result:**
- ✅ User B's trade appears in User A's feed
- ✅ Quote displayed prominently in gradient box
- ✅ 💭 emoji visible
- ✅ "Prediction" badge in header
- ✅ Enhanced border/shadow on card
- ✅ No Solscan link (since it's a dummy trade)

---

### Test 5: Non-Follower Visibility
**Steps:**
1. User A does NOT follow User B
2. User B places a trade with quote
3. User A checks their feed

**Expected Result:**
- ✅ User B's trade does NOT appear in User A's feed
- ✅ Only followed users' trades are visible

---

### Test 6: Multiple Trades
**Steps:**
1. Place 3 trades with different quotes
2. Check social feed

**Expected Result:**
- ✅ All 3 trades appear in feed
- ✅ Sorted by most recent first
- ✅ Each quote displayed correctly
- ✅ All have dummy signatures starting with "DUMMY"

---

### Test 7: Quote Update (PATCH Endpoint)
**Steps:**
1. Place a trade and add a quote
2. Get the trade ID from database
3. Call PATCH endpoint:
```bash
curl -X PATCH http://localhost:3000/api/trades \
  -H "Content-Type: application/json" \
  -d '{
    "tradeId": "YOUR_TRADE_ID",
    "userId": "YOUR_USER_ID",
    "quote": "Updated prediction!"
  }'
```

**Expected Result:**
- ✅ Quote updated in database
- ✅ Feed cache invalidated
- ✅ Updated quote appears in feed

---

### Test 8: Modal Animations
**Steps:**
1. Place a trade to trigger quote modal
2. Observe animations

**Expected Result:**
- ✅ Backdrop fades in smoothly
- ✅ Modal scales in with bounce effect
- ✅ Textarea auto-focuses
- ✅ Close button works
- ✅ Click outside closes modal

---

### Test 9: Dummy Signature Format
**Steps:**
1. Place a trade
2. Check the transaction signature in database

**Expected Result:**
- ✅ Signature starts with "DUMMY"
- ✅ 88 characters long (like real Solana signatures)
- ✅ Base58 encoded characters
- ✅ Unique for each trade

**Verification:**
```sql
SELECT "transactionSig", LENGTH("transactionSig") as sig_length 
FROM "Trade" 
WHERE "isDummy" = true 
ORDER BY "createdAt" DESC 
LIMIT 5;
-- All should be 88 chars and start with DUMMY
```

---

### Test 10: Environment Safety
**Steps:**
1. Set `NODE_ENV=production` (temporarily)
2. Try to place a trade

**Expected Result:**
- ⚠️ Should fail with error about dummy trades being disabled
- ✅ Protects production from dummy data

---

## 🎨 Visual Checks

### Quote Modal
- [ ] Glassmorphism effect visible
- [ ] Gradient border (violet to fuchsia)
- [ ] Decorative blur circles in corners
- [ ] Character counter color changes
- [ ] Loading spinner on submit
- [ ] Responsive on mobile

### Social Feed
- [ ] Quoted trades stand out visually
- [ ] Gradient background on quote box
- [ ] Speech bubble emoji (💭)
- [ ] "Prediction" badge
- [ ] Enhanced shadow/border
- [ ] Color-coded side badges (green/red)
- [ ] No Solscan link for dummy trades

---

## 🐛 Common Issues & Solutions

### Issue: Migration Failed
**Solution:** Ensure `DIRECT_DATABASE_URL` is set in `.env` file

### Issue: Quote Not Appearing in Feed
**Solution:** 
1. Check if user is following the trader
2. Verify feed cache was invalidated
3. Try refreshing the feed

### Issue: Modal Not Opening
**Solution:**
1. Check browser console for errors
2. Verify TradeQuoteModal is imported
3. Check `showQuoteModal` state

### Issue: Dummy Signature Collision
**Solution:** Very unlikely (88 chars base58), but if it happens:
- Timestamp ensures uniqueness per millisecond
- Random part adds 60 chars of entropy

---

## 📊 Database Queries for Testing

### View All Dummy Trades
```sql
SELECT 
  u."displayName",
  t."marketTicker",
  t."side",
  t."amount",
  t."quote",
  t."isDummy",
  t."createdAt"
FROM "Trade" t
JOIN "User" u ON t."userId" = u."id"
WHERE t."isDummy" = true
ORDER BY t."createdAt" DESC;
```

### Count Trades by Type
```sql
SELECT 
  "isDummy",
  COUNT(*) as count,
  COUNT("quote") as with_quotes
FROM "Trade"
GROUP BY "isDummy";
```

### View Feed for User
```sql
SELECT 
  t.*,
  u."displayName"
FROM "Trade" t
JOIN "User" u ON t."userId" = u."id"
WHERE t."userId" IN (
  SELECT "followingId" 
  FROM "Follow" 
  WHERE "followerId" = 'YOUR_USER_ID'
)
ORDER BY t."createdAt" DESC;
```

---

## 🚀 Performance Tests

### Test Feed Loading Speed
1. Create 50+ dummy trades
2. Navigate to social feed
3. Check load time (should be < 1 second with caching)

### Test Quote Modal Responsiveness
1. Open modal
2. Type quickly in textarea
3. Should have no lag or stuttering

---

## ✅ Final Checklist

Before considering testing complete:

- [ ] Placed trade without quote
- [ ] Placed trade with quote
- [ ] Verified quote appears in followers' feed
- [ ] Tested character limit (280 chars)
- [ ] Verified non-followers don't see trades
- [ ] Checked dummy signature format
- [ ] Tested modal animations
- [ ] Verified visual styling matches design
- [ ] Tested on mobile viewport
- [ ] Checked database entries
- [ ] Verified cache invalidation works

---

## 🎉 Success Criteria

Your implementation is successful if:

1. ✅ Users can place trades without DFlow API
2. ✅ Quote modal appears after trade placement
3. ✅ Quotes display beautifully in social feed
4. ✅ Only followers see the trades
5. ✅ Character limit enforced
6. ✅ Dummy signatures are realistic and unique
7. ✅ No production vulnerabilities
8. ✅ Smooth animations and UX
9. ✅ Mobile responsive
10. ✅ Ready for future DFlow integration

---

**Happy Testing! 🚀**

If you encounter any issues, check the console logs and database entries for debugging.

