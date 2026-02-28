Track positions by reading wallet token balances, filtering for outcome mints, and mapping those mints to markets and outcomes. Use this flow for portfolio views, position tables, and redemption eligibility checks.
1
Fetch Wallet Token Accounts

Fetch SPL token accounts for the wallet and keep only non-zero balances. Outcome tokens are Token-2022 mints, so query the Token-2022 program.
Fetch Token Accounts

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const userWallet = new PublicKey("USER_WALLET_ADDRESS_HERE");

const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
  userWallet,
  { programId: TOKEN_2022_PROGRAM_ID }
);

const userTokens = tokenAccounts.value.map(({ account }) => {
  const info = account.data.parsed.info;

  return {
    mint: info.mint,
    rawBalance: info.tokenAmount.amount,
    balance: info.tokenAmount.uiAmount,
    decimals: info.tokenAmount.decimals,
  };
});

const nonZeroBalances = userTokens.filter((token) => token.balance > 0);
2
Filter for Outcome Mints

Filter the wallet mints down to prediction market outcome tokens using the Metadata API.
Filter Outcome Mints

const METADATA_API_BASE_URL = "https://dev-prediction-markets-api.dflow.net";

const allMintAddresses = nonZeroBalances.map((token) => token.mint);

const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/filter_outcome_mints`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: allMintAddresses }),
  }
);

if (!response.ok) {
  throw new Error("Failed to filter outcome mints");
}

const data = await response.json();
const outcomeMints = data.outcomeMints ?? [];
const outcomeTokens = nonZeroBalances.filter((token) =>
  outcomeMints.includes(token.mint)
);
3
Fetch Market Details in Batch

Pull market metadata for those outcome mints so you can label YES/NO and display event and market context.
Fetch Markets Batch

const marketsResponse = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/markets/batch`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mints: outcomeMints }),
  }
);

if (!marketsResponse.ok) {
  throw new Error("Failed to fetch markets batch");
}

const marketsData = await marketsResponse.json();
const markets = marketsData.markets ?? [];

const marketsByMint = new Map<string, any>();
markets.forEach((market: any) => {
  Object.values(market.accounts ?? {}).forEach((account: any) => {
    if (account.yesMint) marketsByMint.set(account.yesMint, market);
    if (account.noMint) marketsByMint.set(account.noMint, market);
  });
});
4
Build Position Rows

Map each outcome token to a market, determine YES/NO, and shape the data for your UI.
Build Positions List

const positions = outcomeTokens.map((token) => {
  const market = marketsByMint.get(token.mint);
  if (!market) {
    return {
      mint: token.mint,
      balance: token.balance,
      position: "UNKNOWN",
      market: null,
    };
  }

  const accounts = Object.values(market.accounts ?? {});
  const isYesToken = accounts.some((account: any) => account.yesMint === token.mint);
  const isNoToken = accounts.some((account: any) => account.noMint === token.mint);

  return {
    mint: token.mint,
    balance: token.balance,
    decimals: token.decimals,
    position: isYesToken ? "YES" : isNoToken ? "NO" : "UNKNOWN",
    market,
  };
});