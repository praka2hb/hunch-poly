import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { USDC_MINT } from '@/app/lib/tradeApi';
import { filterOutcomeMintsServer, fetchMarketsBatchServer, Market } from '@/app/lib/dflowServer';

interface TokenAccount {
  mint: string;
  balance: number;
  decimals: number;
  rawBalance: string;
  tokenAccountAddress: string;
}

export interface OnChainPosition {
  mint: string;
  balance: number;
  decimals: number;
  rawBalance: string;
  tokenAccountAddress: string;
  side: 'yes' | 'no' | 'unknown';
  market: Market | null;
  marketTicker: string | null;
  eventTicker: string | null;
  currentPrice: number | null;
  currentValue: number | null;
  category: 'active' | 'redeemable' | 'closeable' | 'unknown';
  redemptionStatus: string | null;
  marketResult: string | null;
  marketStatus: string | null;
  isWinningSide: boolean;
  scalarOutcomePct: number | null;
  settlementMint: string | null;
}

/**
 * GET /api/positions/onchain?walletAddress={address}
 *
 * Fully on-chain position tracking:
 * 1. Fetch wallet token accounts (Token-2022 + legacy)
 * 2. Filter to prediction market outcome mints
 * 3. Batch-fetch market metadata
 * 4. Categorise each position:
 *    - active:     market is active, user can sell
 *    - redeemable: market determined/finalized, winning side, redemption open
 *    - closeable:  market determined/finalized, losing side (burn + close for rent)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }

    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // ── Step 1: Fetch token accounts ──────────────────────────────────
    const [tokenAccounts2022, tokenAccountsLegacy] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }).catch(() => ({ value: [] })),
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }).catch(() => ({ value: [] })),
    ]);

    const allTokenAccounts = [
      ...tokenAccounts2022.value,
      ...tokenAccountsLegacy.value,
    ];

    // Aggregate by mint, keep first token account address
    const tokenByMint = new Map<string, TokenAccount>();
    allTokenAccounts.forEach(({ pubkey, account }) => {
      const info = account.data.parsed.info;
      const mint = info.mint as string;
      const balance = Number(info.tokenAmount.uiAmount || 0);
      const decimals = Number(info.tokenAmount.decimals || 0);
      const rawBalance = String(info.tokenAmount.amount || '0');
      const tokenAccountAddress = pubkey.toBase58();

      const existing = tokenByMint.get(mint);
      if (existing) {
        existing.balance += balance;
        existing.rawBalance = (BigInt(existing.rawBalance) + BigInt(rawBalance)).toString();
        existing.decimals = decimals || existing.decimals;
      } else {
        tokenByMint.set(mint, { mint, balance, decimals, rawBalance, tokenAccountAddress });
      }
    });

    // Include all tokens (even zero balance) so we can find closeable accounts
    const userTokens: TokenAccount[] = Array.from(tokenByMint.values());

    console.log(`[OnChain] Found ${userTokens.length} token accounts for ${walletAddress}`);

    if (userTokens.length === 0) {
      return NextResponse.json({
        positions: [], active: [], redeemable: [], closeable: [],
        fetchedAt: new Date().toISOString(), source: 'onchain',
      }, { status: 200 });
    }

    // ── Step 2: Filter to prediction market outcome mints ──────────────
    const allMintAddresses = userTokens.map(t => t.mint);
    const predictionMintAddresses = await filterOutcomeMintsServer(allMintAddresses);

    console.log(`[OnChain] ${predictionMintAddresses.length} prediction market tokens`);

    if (predictionMintAddresses.length === 0) {
      return NextResponse.json({
        positions: [], active: [], redeemable: [], closeable: [],
        fetchedAt: new Date().toISOString(), source: 'onchain',
      }, { status: 200 });
    }

    const outcomeTokens = userTokens.filter(t => predictionMintAddresses.includes(t.mint));

    // ── Step 3: Fetch market details in batch ──────────────────────────
    const markets = await fetchMarketsBatchServer(predictionMintAddresses);
    console.log(`[OnChain] Received ${markets.length} markets from batch`);

    const marketsByMint = new Map<string, Market>();
    markets.forEach((market: Market) => {
      if (market.accounts && typeof market.accounts === 'object') {
        Object.values(market.accounts).forEach((account: any) => {
          if (account?.yesMint) marketsByMint.set(account.yesMint, market);
          if (account?.noMint) marketsByMint.set(account.noMint, market);
        });
      }
    });

    // ── Step 4: Build position rows with categorisation ────────────────
    const positions: OnChainPosition[] = outcomeTokens.map((token) => {
      const marketData = marketsByMint.get(token.mint);

      if (!marketData) {
        return buildUnknownPosition(token);
      }

      const side = determineSide(token.mint, marketData);
      const status = (marketData.status || '').toLowerCase();

      const { settlementMint, account: settlementAccount } = findSettlementAccount(marketData);
      const redemptionStatus = settlementAccount
        ? String(settlementAccount.redemptionStatus || '').toLowerCase()
        : null;
      const scalarOutcomePct: number | null = settlementAccount?.scalarOutcomePct ?? null;
      const marketResult = (marketData.result || '').toLowerCase();

      // Robust "isDetermined" using multiple signals:
      // 1. status field explicitly says so
      // 2. result field has a value (yes/no) → market has been resolved
      // 3. redemptionStatus is open → market is determined
      const statusIsDetermined = ['finalized', 'determined', 'settled', 'closed', 'resolved'].includes(status);
      const hasResult = marketResult === 'yes' || marketResult === 'no';
      const redemptionIsOpen = redemptionStatus === 'open';
      const isDetermined = statusIsDetermined || hasResult || redemptionIsOpen;

      // Only consider truly active if status is explicitly 'active' or we have no signals at all
      const isExplicitlyActive = status === 'active';

      const isWinningSide = computeIsWinningSide(side, marketResult, scalarOutcomePct);
      const currentPrice = computeCurrentPrice(marketData, side, isDetermined, isWinningSide, marketResult, scalarOutcomePct);
      const currentValue = currentPrice !== null ? token.balance * currentPrice : null;

      // Log raw market data for debugging
      console.log(`[OnChain] Position ${token.mint.slice(0, 8)}...: status=${status}, result=${marketResult}, redemption=${redemptionStatus}, side=${side}, isDetermined=${isDetermined}, isWinningSide=${isWinningSide}, balance=${token.balance}, value=${currentValue}`);

      let category: OnChainPosition['category'] = 'unknown';
      
      // If position value is negligible (≤ $0.01), mark as closeable to reclaim rent
      if (currentValue !== null && currentValue <= 0.01) {
        category = 'closeable';
      } else if (token.balance === 0) {
        category = 'closeable';
      } else if (isExplicitlyActive && !isDetermined) {
        category = 'active';
      } else if (!isDetermined && !isExplicitlyActive && status === '') {
        // Unknown status with no determination signals → assume active
        category = 'active';
      } else if (isDetermined && token.balance > 0 && isWinningSide) {
        category = 'redeemable';
      } else if (isDetermined && !isWinningSide) {
        // Losing side in determined market → closeable to reclaim rent
        category = 'closeable';
      } else if (!isDetermined) {
        // Fallback: if nothing determined, assume active
        category = 'active';
      }

      return {
        mint: token.mint,
        balance: token.balance,
        decimals: token.decimals,
        rawBalance: token.rawBalance,
        tokenAccountAddress: token.tokenAccountAddress,
        side,
        market: marketData,
        marketTicker: marketData.ticker || null,
        eventTicker: marketData.eventTicker || null,
        currentPrice,
        currentValue,
        category,
        redemptionStatus,
        marketResult: marketData.result || null,
        marketStatus: marketData.status || null,
        isWinningSide,
        scalarOutcomePct,
        settlementMint,
      };
    });

    const active = positions.filter(p => p.category === 'active');
    const redeemable = positions.filter(p => p.category === 'redeemable');
    const closeable = positions.filter(p => p.category === 'closeable');

    console.log(`[OnChain] ${active.length} active, ${redeemable.length} redeemable, ${closeable.length} closeable`);

    return NextResponse.json(
      {
        positions,
        active,
        redeemable,
        closeable,
        fetchedAt: new Date().toISOString(),
        source: 'onchain',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
      }
    );
  } catch (error: any) {
    console.error('[OnChain] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch on-chain positions' },
      { status: 500 }
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildUnknownPosition(token: TokenAccount): OnChainPosition {
  return {
    mint: token.mint,
    balance: token.balance,
    decimals: token.decimals,
    rawBalance: token.rawBalance,
    tokenAccountAddress: token.tokenAccountAddress,
    side: 'unknown',
    market: null,
    marketTicker: null,
    eventTicker: null,
    currentPrice: null,
    currentValue: null,
    category: 'unknown',
    redemptionStatus: null,
    marketResult: null,
    marketStatus: null,
    isWinningSide: false,
    scalarOutcomePct: null,
    settlementMint: null,
  };
}

function determineSide(mint: string, market: Market): 'yes' | 'no' | 'unknown' {
  if (!market.accounts || typeof market.accounts !== 'object') return 'unknown';
  const usdcAccount = (market.accounts as any)[USDC_MINT];
  if (usdcAccount) {
    if (usdcAccount.yesMint === mint) return 'yes';
    if (usdcAccount.noMint === mint) return 'no';
  }
  for (const account of Object.values(market.accounts)) {
    const acct = account as any;
    if (acct?.yesMint === mint) return 'yes';
    if (acct?.noMint === mint) return 'no';
  }
  return 'unknown';
}

function findSettlementAccount(market: Market): { settlementMint: string | null; account: any } {
  if (!market.accounts || typeof market.accounts !== 'object') {
    return { settlementMint: null, account: null };
  }
  const usdcAcct = (market.accounts as any)[USDC_MINT];
  if (usdcAcct) return { settlementMint: USDC_MINT, account: usdcAcct };
  for (const [mint, acct] of Object.entries(market.accounts)) {
    if ((acct as any)?.redemptionStatus?.toLowerCase() === 'open') {
      return { settlementMint: mint, account: acct };
    }
  }
  const entries = Object.entries(market.accounts);
  if (entries.length > 0) return { settlementMint: entries[0][0], account: entries[0][1] };
  return { settlementMint: null, account: null };
}

function computeIsWinningSide(
  side: 'yes' | 'no' | 'unknown',
  marketResult: string,
  scalarOutcomePct: number | null
): boolean {
  if (side === 'unknown') return false;
  if (marketResult === '' && scalarOutcomePct !== null && scalarOutcomePct !== undefined) return true;
  if (marketResult === 'yes' && side === 'yes') return true;
  if (marketResult === 'no' && side === 'no') return true;
  return false;
}

function computeCurrentPrice(
  market: Market,
  side: 'yes' | 'no' | 'unknown',
  isDetermined: boolean,
  isWinningSide: boolean,
  marketResult: string,
  scalarOutcomePct: number | null
): number | null {
  if (side === 'unknown') return null;
  if (isDetermined) {
    if (marketResult === '' && scalarOutcomePct !== null && scalarOutcomePct !== undefined) {
      return side === 'yes' ? scalarOutcomePct / 10000 : (10000 - scalarOutcomePct) / 10000;
    }
    return isWinningSide ? 1.0 : 0.0;
  }
  if (side === 'yes') {
    if (market.yesBid && market.yesAsk) return (parseFloat(market.yesBid) + parseFloat(market.yesAsk)) / 2;
    if (market.yesBid) return parseFloat(market.yesBid);
    if (market.yesAsk) return parseFloat(market.yesAsk);
  } else {
    if (market.noBid && market.noAsk) return (parseFloat(market.noBid) + parseFloat(market.noAsk)) / 2;
    if (market.noBid) return parseFloat(market.noBid);
    if (market.noAsk) return parseFloat(market.noAsk);
  }
  return null;
}
