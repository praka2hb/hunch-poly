Discover Prediction Market Tokens
How to find on-chain prediction markets using the DFlow Prediction Market Metadata API

This guide shows you how to explore on-chain prediction markets utilizing the DFlow Prediction Market Metadata API, and accessing their token addresses for trading.
This quickstart demonstrates how to use the Prediction Market Metadata API to build discovery UIs. For trading tokens, see the Trade Tokens guide.
​
Overview
The DFlow Prediction Market Metadata API includes multiple ways to discover prediction market outcome tokens:
Fetch all events
Fetch events by market status
Get events by relevant categories and tags
1
Fetch Events with Nested Markets

Use the /api/v1/events endpoint with withNestedMarkets=true to retrieve events along with their associated markets. Each market contains token addresses in the accounts field that you can use for trading.
Get All Events with Markets


Copy

Ask AI
/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch events with nested markets included
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&limit=200`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events");
}

const data = await response.json();
const events = data.events;

/// Log details of each event and nested markets
events.forEach((event: any) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market: any) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account: any) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
2
Fetch Events by Market Status

Use the status filter on /api/v1/events endpoint to retrieve and markets that are actively available for trading or markets that are coming soon.
Get Events with Open Markets


Copy

Ask AI
/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch events with nested markets included
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&status=active&limit=200`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events");
}

const data = await response.json();
const events = data.events;

/// Log details of each event and nested markets
events.forEach((event: any) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market: any) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account: any) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
Get Events with Initialized Markets


Copy

Ask AI
/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch events with nested markets included
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&status=initialized&limit=200`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events");
}

const data = await response.json();
const events = data.events;

/// Log details of each event and nested markets
events.forEach((event: any) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market: any) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account: any) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
3
Get Events by Categories and Tags

Use categories tags to filter series and find relevant events and markets. This approach involves: (1) retrieving available tags organized by category, (2) filtering series by tags or categories, and (3) fetching events filtered by series tickers (comma-separated) to discover markets.
Get Categories and Tags


Copy

Ask AI
/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch tags organized by categories
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/tags_by_categories`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch tags by categories");
}

const data = await response.json();
const tagsByCategories = data.tagsByCategories;

/// Display available categories and their tags
Object.entries(tagsByCategories).forEach(([category, tags]: [string, any]) => {
  console.log(`  Tags for ${category}: ${tags.join(", ")}`);
});
Filter Series by Category and Tags


Copy

Ask AI
/// Select a category or tags from the tags_by_categories response
const selectedCategory = "Sports";
const selectedTag = "Football";

/// Option 1: Filter series by category
const responseByCategory = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/series?category=${selectedCategory}`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

const dataByCategory = await responseByCategory.json();

/// Log series with ticker and title
console.log(
  `Found ${dataByCategory.series.length} series with "${selectedCategory}"`
);
dataByCategory.series.forEach((s: any) => {
  console.log(`  ${s.ticker}: ${s.title}`);
});

/// Extract series tickers for filtering events
const categorizedSeriesTickers = dataByCategory.series.map((s) => s.ticker);

/// Option 2: Filter series by tag
const responseByTag = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/series?tags=${selectedTag}`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!responseByTag.ok) {
  throw new Error("Failed to fetch series");
}

const dataByTag = await responseByTag.json();

/// Log series with ticker and title
console.log(`Found ${dataByTag.series.length} series with "${selectedTag}"`);
dataByTag.series.forEach((s: any) => {
  console.log(`  ${s.ticker}: ${s.title}`);
});

/// Extract series tickers for filtering events
const taggedSeriesTickers = dataByTag.series.map((s) => s.ticker);

/// Option 3: Filter by both category and tags (comma-separated)
const selectedTags = "Football,Soccer";
const responseWithBoth = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/series?category=${selectedCategory}&tags=${selectedTags}`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

const dataWithBoth = await responseWithBoth.json();
const filteredSeries = dataWithBoth.series;

/// Log series with ticker and title
console.log(
  `Found ${filteredSeries.length} series with category "${selectedCategory}" and tags "${selectedTags}"`
);
filteredSeries.forEach((s: any) => {
  console.log(`  ${s.ticker}: ${s.title}`);
});

/// Extract series tickers for filtering events
const seriesTickers = filteredSeries.map((s) => s.ticker);
Get Events Filtered by Series Tickers


Copy

Ask AI
/// Option 1: Filter by a single series ticker
const selectedSeriesTicker = seriesTickers[0]; // Example: "KXNFLGAME"

/// Fetch events filtered by a single series ticker with nested markets
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?seriesTickers=${selectedSeriesTicker}&withNestedMarkets=true&limit=100`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

/// Option 2: Filter by multiple series tickers (comma-separated)
const multipleSeriesTickers = seriesTickers.slice(0, 3).join(","); // Example: "KXNFLGAME,KXNBAGAME,KXNHLGAME"

/// Fetch events filtered by multiple series tickers with nested markets
const responseMultiple = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?seriesTickers=${multipleSeriesTickers}&withNestedMarkets=true&limit=100`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events by series");
}

const data = await response.json();
const filteredEvents = data.events;

/// Use responseMultiple for multiple series tickers
/// const dataMultiple = await responseMultiple.json();
/// const filteredEvents = dataMultiple.events;

/// Log details of each event and markets
filteredEvents.forEach((event) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
​
API Response Structure
​
Events Response
The events endpoint returns:
Event Information: Ticker, title, subtitle, series ticker
Nested Markets (when withNestedMarkets=true): Array of markets with:
Market ticker, title, status
Accounts: Object containing yesMint and noMint token addresses
Volume, open interest, timing information
​
Tags by Categories Response
Returns a mapping of categories to arrays of tags:

Copy

Ask AI
{
  "tagsByCategories": {
    "Sports": ["Football", "Soccer", "Basketball", "Hockey", "Baseball", "NFL"],
    "Crypto": ["Pre-Market", "SOL", "BTC", "ETH", "SHIBA", "Dogecoin"]
  }
}
​
Series Response
Returns series templates with:
Ticker: Used to filter events
Title: Human-readable series name
Category: Series category
Tags: Array of associated tags
Frequency: How often events in this series occur



Retrieve User Prediction Market Positions
How to fetch and identify a user’s prediction market positions using onchain data

This guide shows you how to retrieve a user’s prediction market positions by querying onchain token account data and mapping it to the DFlow Prediction Market Metadata API.
This quickstart assumes familiarity with Solana’s token accounts and RPC connections. If unfamiliar, please refer to the Solana Cookbook.
​
Overview
To retrieve a user’s prediction market positions, you’ll need to:
Fetch all token accounts owned by the user
Filter for outcome tokens
Map outcome token mints to market details using the Metadata API
Calculate position values
1
Fetch User's Token Accounts

Use Solana’s getTokenAccountsByOwner RPC method to retrieve all token accounts for a given user wallet.
Fetch Token Accounts


Copy

Ask AI
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

/// Initialize Solana connection
const connection = new Connection("https://api.mainnet-beta.solana.com");

/// User's wallet address
const userWallet = new PublicKey("USER_WALLET_ADDRESS_HERE");

/// Fetch all token accounts owned by the user
const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
  userWallet,
  {
    programId: TOKEN_PROGRAM_ID,
  }
);

/// Extract token account information
const userTokens = tokenAccounts.value.map((accountInfo) => {
  const parsedInfo = accountInfo.account.data.parsed.info;
  return {
    mint: parsedInfo.mint,
    balance: parsedInfo.tokenAmount.uiAmount,
    decimals: parsedInfo.tokenAmount.decimals,
    rawBalance: parsedInfo.tokenAmount.amount,
  };
});

/// Filter out tokens with zero balance
const nonZeroBalances = userTokens.filter((token) => token.balance > 0);
2
Identify Prediction Market Tokens

Use the /api/v1/filter_outcome_mints endpoint to filter the user’s token addresses and return only those that are prediction market outcome mints.
Filter Prediction Market Tokens


Copy

Ask AI
/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Extract all mint addresses from user's tokens
const allMintAddresses = nonZeroBalances.map((token) => token.mint);

/// Filter to get only prediction market outcome mints
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/filter_outcome_mints`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ addresses: allMintAddresses }),
  }
);

if (!response.ok) {
  throw new Error("Failed to filter outcome mints");
}

const data = await response.json();
const predictionMintAddresses = data.outcomeMints;
3
Fetch Market Details

Use the /api/v1/markets/batch endpoint to retrieve detailed market information for all outcome tokens in a single request, including event details, pricing, volume, and settlement status.
Get Market Details


Copy

Ask AI
/// Fetch market details for all outcome tokens in batch
const response = await fetch(`${METADATA_API_BASE_URL}/api/v1/markets/batch`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ mints: predictionMintAddresses }),
});

if (!response.ok) {
  throw new Error("Failed to fetch markets batch");
}

const data = await response.json();
const markets = data.markets;

/// Create a map by mint address for efficient lookup
const marketsByMint = new Map<string, any>();
markets.forEach((market: any) => {
  /// Map by yesMint, noMint, and marketLedger
  Object.values(market.accounts).forEach((account: any) => {
    marketsByMint.set(account.yesMint, market);
    marketsByMint.set(account.noMint, market);
    marketsByMint.set(account.marketLedger, market);
  });
});

/// Map outcome tokens to their market data and determine position type
const userPositions = outcomeTokens.map((token) => {
  const marketData = marketsByMint.get(token.mint);

  if (!marketData) {
    return {
      mint: token.mint,
      balance: token.balance,
      decimals: token.decimals,
      position: "UNKNOWN",
      market: null,
    };
  }

  /// Determine if this is a YES or NO token
  const isYesToken = Object.values(marketData.accounts).some(
    (account: any) => account.yesMint === token.mint
  );

  const isNoToken = Object.values(marketData.accounts).some(
    (account: any) => account.noMint === token.mint
  );

  return {
    mint: token.mint,
    balance: token.balance,
    decimals: token.decimals,
    position: isYesToken ? "YES" : isNoToken ? "NO" : "UNKNOWN",
    market: marketData,
  };
});
​
API Response Structure
The /api/v1/markets/batch endpoint returns comprehensive market data including:
Market Information: Title, subtitle, event ticker, category
Accounts: Token mint addresses (yesMint, noMint, marketLedger)
Timing: Open time, close time, expiration time
Market Data: Volume, open interest, status
Settlement: Result (if market is resolved)
Rules: Primary and secondary market rules


Redeem Determined Market Outcome Tokens
How to redeem determined prediction market outcome tokens for stablecoins

This guide shows you how to redeem determined prediction market outcome tokens by checking if they’re redeemable and requesting a redemption order through the DFlow Trade API.
This quickstart assumes you already have a list of outcome token mints you want to redeem. If you need to discover your positions first, see the User Prediction Positions guide.
Redemption involves trading expired OutcomeTokens for the stablecoin you opened your position with. For more details on the settlement process, see the Event Settlement and Redemption concept guide.
Note: Outcome tokens always have 0 decimals, so the amount to redeem is the raw token count from the user’s token balance.
​
Overview
To redeem determined market outcome tokens, you’ll need to:
Check if the outcome token is redeemable by verifying market status and redemption availability
Request a redemption order using the DFlow Trade API
Sign and submit the transaction (same process as regular trading)
1
Check if Outcome Token is Redeemable

Use the /api/v1/market/by-mint/{mint_address} endpoint to fetch market details and verify that the outcome token is redeemable. A token is redeemable when:
The market status is "determined" or "finalized"
The market result ("yes" or "no") matches the user’s outcome token (the outcome mint must match the yesMint or noMint for the determined side)
The redemption status for the settlement mint is "Open"
Check Redemption Eligibility


Copy

Ask AI
/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Settlement mint constant (USDC)
/// If you only support one settlement mint, use this constant
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/// Outcome token mint address (YES or NO token)
const outcomeMint = "OUTCOME_TOKEN_MINT_ADDRESS_HERE";

/// Fetch market details by mint address
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/market/by-mint/${outcomeMint}`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch market details");
}

const market = await response.json();

/// Check if market is determined (status can be "determined" or "finalized")
if (market.status !== "determined" && market.status !== "finalized") {
  throw new Error(`Market is not determined. Current status: ${market.status}`);
}

/// Check if the outcome mint matches the market result
/// The result is "yes" or "no", so we need to check if the outcome mint
/// matches the corresponding yesMint or noMint in the accounts
const result = market.result; // "yes" or "no"
let isDeterminedOutcome = false;
let settlementMint;

/// Option 1: Use a constant settlement mint (e.g., USDC)
/// If you only support one settlement mint, use this approach
if (market.accounts[USDC_MINT]) {
  const usdcAccount = market.accounts[USDC_MINT];

  /// Check if redemption is open and outcome matches
  if (usdcAccount.redemptionStatus === "open") {
    if (
      (result === "yes" && usdcAccount.yesMint === outcomeMint) ||
      (result === "no" && usdcAccount.noMint === outcomeMint)
    ) {
      isDeterminedOutcome = true;
      settlementMint = USDC_MINT;
    }
  } else {
    throw new Error(`Redemption is not open for ${outcomeMint}`);
  }
}

/// Option 2: Find settlement mint dynamically (if you support multiple)
/// Uncomment this if you need to support multiple settlement mints
/*
if (!settlementMint) {
  for (const [mint, account] of Object.entries(market.accounts)) {
    if (account.redemptionStatus === "open") {
      /// Check if this outcome mint matches the determined side
      if (result === "yes" && account.yesMint === outcomeMint) {
        isDeterminedOutcome = true;
        settlementMint = mint;
        break;
      } else if (result === "no" && account.noMint === outcomeMint) {
        isDeterminedOutcome = true;
        settlementMint = mint;
        break;
      }
    } else {
      throw new Error(`Redemption is not open for ${outcomeMint}`);
    }
  }
}
*/

if (!isDeterminedOutcome) {
  throw new Error(
    `Outcome token does not match market result. Market result: ${result}, Token: ${outcomeMint}`
  );
}

if (!settlementMint) {
  throw new Error("No settlement mint with open redemption status found");
}

const settlementAccount = market.accounts[settlementMint];

console.log("Token is redeemable!", {
  outcomeMint,
  settlementMint,
  redemptionStatus: settlementAccount.redemptionStatus,
  marketTitle: market.title,
});
2
Request Redemption Order

Use the Trade API /order endpoint to request a redemption order. The redemption is treated as a trade where you swap your outcome token for the settlement stablecoin.
Request Redemption Order


Copy

Ask AI
/// Base URL for the DFlow Trade API
const API_BASE_URL = "https://quote-api.dflow.net";

/// Settlement mint constant (USDC)
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/// Outcome token mint (YES or NO token you hold)
const outcomeMint = "OUTCOME_TOKEN_MINT_ADDRESS_HERE";

/// Settlement mint (use the constant or the value found in Step 1)
const settlementMint = USDC_MINT;

/// Amount of outcome tokens to redeem
/// Outcome tokens always have 0 decimals, so the amount is the raw token count
/// Get this from the user's token balance (rawBalance from token account)
const amount = 1; // Example: 1 outcome token (0 decimals)

/// User's public key
const userPublicKey = keypair.publicKey.toBase58();

const queryParams = new URLSearchParams();
queryParams.append("userPublicKey", userPublicKey);
queryParams.append("inputMint", outcomeMint);
queryParams.append("outputMint", settlementMint);
queryParams.append("amount", amount.toString());

const orderResponse = await fetch(
  `${API_BASE_URL}/order?${queryParams.toString()}`
).then((x) => x.json());

console.log(
  `Redemption order received! ${orderResponse.inAmount} of ${orderResponse.inputMint} is redeemable for ${orderResponse.outAmount} of ${orderResponse.outputMint}`
);
3
Sign and Submit Redemption Transaction

The redemption transaction follows the same workflow as regular trading. Deserialize the transaction, sign it with your keypair, and submit it to Solana. Then monitor the order status based on the execution mode.
Sign and Submit Transaction

Redemption uses the same Trade API workflow as regular trading. Follow the steps in the Trade Tokens quickstart to:
Sign the Transaction: Deserialize the transaction from base64 and sign it with your keypair
Submit to Solana: Send the signed transaction to your Solana RPC connection
Monitor Order Status:
For sync trades: Use standard RPC confirmation
For async trades: Poll the /order-status endpoint
The transaction returned from the redemption order request should be handled exactly like a regular trade transaction. See the Trade Tokens guide for complete code examples.
​
API Response Structure
​
Market Response
The /api/v1/market/by-mint/{mint_address} endpoint returns market data including:
Status: Market status ("determined" or "finalized" when outcome is finalized)
Result: The determined outcome as a string ("yes" or "no")
Accounts: Object mapping settlement mint addresses (e.g., "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" for USDC) to account information:
yesMint: YES outcome token mint address
noMint: NO outcome token mint address
redemptionStatus: Redemption status ("Open" when redemption is available, "pending" when not yet available)
marketLedger: Market ledger account address
​
Order Response
The Trade API /order endpoint returns:
Transaction: Base64-encoded transaction ready to sign and submit
Execution Mode: "sync" (atomic) or "async" (multi-transaction)
Quote information including expected output amount