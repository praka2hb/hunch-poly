# Solana Actions Blinks for Prediction Markets

This application now supports Solana Actions (blinks) that allow users to create shareable links for placing orders on prediction markets.

## What are Blinks?

Blinks (blockchain links) are shareable URLs that enable users to interact with Solana transactions directly from any wallet or app that supports Solana Actions. When someone clicks a blink, they can immediately place an order on a prediction market without navigating to your app.

## How It Works

1. **GET Request**: Returns metadata about the market and available actions (Buy YES or Buy NO)
2. **POST Request**: Returns a signable transaction for placing the order
3. **User Signs**: The wallet prompts the user to sign and submit the transaction

## Creating Blink URLs

### For Users in Your App

Users can click the "Share Blink" button on any active market to get:
- A direct blink URL (e.g., `https://yourdomain.com/market/MARKET_TICKER`)
- A Dial.to blink URL (e.g., `https://dial.to/?action=solana-action:...`)

### Programmatically

```typescript
import { createMarketBlinkUrl, createBlinkUrlWithAction } from '@/app/lib/blinkUtils';

// Create a simple blink URL
const blinkUrl = createMarketBlinkUrl('MARKET_TICKER');

// Create a Dial.to blink URL
const dialBlinkUrl = createBlinkUrlWithAction('MARKET_TICKER', 'https://dial.to');
```

## API Endpoints

### GET `/api/actions/market/[ticker]`

Returns action metadata including:
- Market title and description
- Available actions (Buy YES / Buy NO)
- Amount input field
- Market status (disabled if not active)

**Query Parameters:**
- `side` (optional): `yes` or `no` - If provided, returns a single action for that side

**Example:**
```
GET /api/actions/market/KXBTCMAX150-25-26APR30-149999.99
```

### POST `/api/actions/market/[ticker]`

Returns a base64-encoded transaction for placing an order.

**Query Parameters:**
- `side`: `yes` or `no` (required)
- `amount`: USDC amount as a number (required, minimum 0.000001)

**Request Body:**
```json
{
  "account": "<base58-public-key>"
}
```

**Response:**
```json
{
  "transaction": "<base64-encoded-transaction>",
  "message": "Order to buy YES tokens for 10 USDC on \"Market Title\""
}
```

## actions.json

The `actions.json` file maps website URLs to Action API endpoints:

- `/market/*` → `/api/actions/market/*`
- `/api/actions/**` → `/api/actions/**`

This allows blink clients to automatically discover and interact with your actions.

## Testing Blinks

1. **Using Blinks Inspector**: Visit [Blinks Inspector](https://blinks-inspector.dialect.to) and paste your blink URL
2. **Using Dial.to**: Share a Dial.to blink URL and open it in a wallet that supports blinks
3. **Direct Testing**: Make GET/POST requests to your action endpoints

## Example Blink URLs

```
# Direct blink URL
https://yourdomain.com/market/KXBTCMAX150-25-26APR30-149999.99

# Solana Action protocol URL
solana-action:https://yourdomain.com/api/actions/market/KXBTCMAX150-25-26APR30-149999.99

# Dial.to blink URL
https://dial.to/?action=solana-action%3Ahttps%3A%2F%2Fyourdomain.com%2Fapi%2Factions%2Fmarket%2FKXBTCMAX150-25-26APR30-149999.99
```

## CORS Headers

All action endpoints include the required CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, Content-Encoding, Accept-Encoding`

## Verification

To get your blinks verified by Dialect's Actions Registry (for Twitter unfurling), apply at: https://dial.to/register

## Integration with Your App

The `ShareBlink` component is already integrated into `MarketsList`. Users can:
1. View markets
2. Click "Share Blink" on any active market
3. Copy the blink URL
4. Share it anywhere (Twitter, Discord, etc.)

When someone clicks the blink, they'll see:
- Market title and description
- Buy YES and Buy NO buttons
- Amount input field
- Transaction preview in their wallet

