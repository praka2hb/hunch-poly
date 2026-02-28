# Hunch API Summary

## Actions (Solana Blinks/DeFi Actions)

### `GET /api/actions.json`
Returns actions.json mapping for Solana Actions (Blinks). Maps path patterns to API endpoints.

### `GET /api/actions/market/[ticker]`
Returns Solana Action metadata for a prediction market. Supports `side` query param (yes/no) to show single action or both YES/NO options.

### `POST /api/actions/market/[ticker]`
Creates and returns a Solana transaction for placing an order on a prediction market. Requires `side` (yes/no) and `amount` query params.

---

## Copy Trading

### `POST /api/copy/execute`
QStash webhook endpoint that executes copy trades for followers when a leader makes a trade. Verifies QStash signature and processes copy trade jobs.

### `POST /api/copy-settings`
Creates or updates copy trading settings (amount per trade, max total amount, expiration).

### `GET /api/copy-settings`
Gets copy settings - either specific (with followerId & leaderId) or all settings for a follower.

### `DELETE /api/copy-settings`
Deletes copy trading settings for a follower-leader pair.

### `PATCH /api/copy-settings/[followerId]/[leaderId]`
Updates copy settings for a specific follower-leader pair. Supports toggle enabled status or update fields.

---

## DFlow Integration (Prediction Markets)

### `GET /api/dflow/events`
Fetches events from DFlow API with filters (limit, status, withNestedMarkets, cursor).

### `GET /api/dflow/event/[ticker]`
Gets event details by ticker.

### `GET /api/dflow/event/[ticker]/candlesticks`
Gets candlestick price data for an event with optional time range (startTs, endTs, periodInterval).

### `GET /api/dflow/market/[ticker]`
Gets market details by ticker.

### `GET /api/dflow/market-by-mint/[mint]`
Gets market details by mint address.

### `GET /api/dflow/candlesticks/[mint]`
Gets candlestick price data for a market by mint address with optional time range.

### `GET /api/dflow/quote`
Gets a trade quote/order request (userPublicKey, inputMint, outputMint, amount, slippageBps).

### `GET /api/dflow/order-status`
Gets order status by transaction signature.

### `POST /api/dflow/filter-outcome-mints`
Filters an array of addresses to return only outcome mints (yes/no tokens).

### `GET /api/dflow/series`
Fetches series from DFlow API with optional category and tags filters.

### `GET /api/dflow/tags`
Fetches tags organized by categories from DFlow API.

---

## Markets

### `POST /api/markets/batch`
Fetches multiple markets by ticker array (max 100). Returns market map keyed by ticker.

### `POST /api/markets/batch-by-mint`
Fetches multiple markets by mint address array.

### `POST /api/markets/filter-outcome-mints`
Filters mint addresses to return only outcome mints (yes/no tokens).

---

## News

### `GET /api/news/articles`
Lists news articles with pagination and filtering (limit, offset, source, category, date range).

### `GET /api/news/articles/[id]`
Gets a single news article by ID with its matched markets/events.

### `POST /api/news/articles/[id]`
Triggers re-matching for a specific news article.

### `GET /api/news/events/[ticker]`
Gets news articles matched to a specific event by ticker.

### `GET /api/news/markets/[ticker]`
Gets news articles matched to a specific market by ticker.

### `GET /api/news/[ticker]`
Fetches news from NewsAPI for an event (requires title query param, optional subtitle, competition).

### `POST /api/news/event`
Fetches news from NewsAPI for a single event (requires event object in body).

### `POST /api/news/events`
Fetches news from NewsAPI for multiple events (requires events array in body).

---

## Cron Jobs

### `POST /api/cron/news-fetch`
QStash cron job that fetches news from RSS feeds every 3 hours. Aggregates and stores articles.

### `POST /api/cron/news-match`
QStash cron job that matches news articles to markets/events every 2 hours using embeddings. Supports rematch mode.

---

## Social Feed

### `GET /api/feed`
Gets social feed - either global (all trades) or personalized (trades from followed users). Query params: userId, mode (global/following), limit, offset.

---

## Follow System

### `POST /api/follow`
Creates a follow relationship (followerId, followingId).

### `DELETE /api/follow`
Removes a follow relationship (followerId, followingId).

### `GET /api/follow/followers`
Gets list of followers for a user (userId query param).

### `GET /api/follow/following`
Gets list of users being followed by a user (userId query param).

---

## Trades

### `POST /api/trades`
Creates a new trade record. Triggers copy trading fan-out to all active followers.

### `GET /api/trades`
Gets trades for a user (userId, limit, offset query params).

### `PATCH /api/trades`
Updates a trade's quote/comment (tradeId, userId, quote fields).

---

## Positions

### `GET /api/positions`
Gets user's aggregated positions with P&L calculations (userId query param, optional includeStats).

---

## Users

### `GET /api/users/[userId]`
Gets user profile by user ID.

### `GET /api/users/by-username/[username]`
Gets user profile by display name/username.

### `POST /api/users/batch`
Fetches multiple users by ID array (max 50). Returns user map keyed by ID.

### `GET /api/users/search`
Searches users by query string or wallet address (q or walletAddress query params, optional type filter).

### `GET /api/users/suggested`
Gets top traders for suggestions (limit, optional excludeUserId query params).

### `POST /api/users/sync`
Syncs/creates user from Privy auth (privyId, walletAddress, displayName, avatarUrl).

---

## Summary by Category

- **Actions**: 3 endpoints for Solana Blinks integration
- **Copy Trading**: 5 endpoints for copy trading settings and execution
- **DFlow**: 11 endpoints for prediction market data (events, markets, quotes, candlesticks)
- **Markets**: 3 endpoints for batch market fetching
- **News**: 8 endpoints for news aggregation and matching
- **Cron**: 2 endpoints for scheduled news fetching/matching
- **Social**: 1 feed endpoint
- **Follow**: 4 endpoints for follow/unfollow functionality
- **Trades**: 3 endpoints for trade CRUD operations
- **Positions**: 1 endpoint for position aggregation
- **Users**: 6 endpoints for user profiles and discovery

**Total: 47 API endpoints**

