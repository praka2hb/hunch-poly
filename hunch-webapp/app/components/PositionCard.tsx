'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import type { AggregatedPosition } from '../lib/positionService';
import { formatMarketTitle } from '../lib/marketUtils';
import { requestOrder, getOrderStatus, USDC_MINT } from '../lib/tradeApi';
import { fetchMarketByMint } from '../lib/api';
import { useAppData } from '../contexts/AppDataContext';

interface PositionCardProps {
  position: AggregatedPosition;
  allowActions?: boolean;
  isPrevious?: boolean;
  category?: 'active' | 'redeemable' | 'closeable' | 'unknown';
  onActionComplete?: () => void;
}

export default function PositionCard({ position, allowActions = false, isPrevious = false, category, onActionComplete }: PositionCardProps) {
  const router = useRouter();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { triggerPositionsRefresh, currentUserId } = useAppData();
  const [actionLoading, setActionLoading] = useState<'sell' | 'redeem' | 'close' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const solanaWallet = wallets[0];
  const walletAddress = solanaWallet?.address;

  const primaryRpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = useRef(new Connection(primaryRpcUrl, 'confirmed')).current;
  const fallbackConnection = useRef(
    primaryRpcUrl === 'https://api.mainnet-beta.solana.com'
      ? null
      : new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
  ).current;

  const handleClick = () => {
    // Redirect to event page if eventTicker exists, otherwise to market page
    if (position.market?.eventTicker) {
      router.push(`/event/${position.market.eventTicker}`);
    } else if (position.market?.ticker) {
      router.push(`/market/${position.market.ticker}`);
    }
  };

  // Format currency
  const formatCurrency = (value: number | null) => {
    if (value === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format percentage
  const formatPercentage = (value: number | null) => {
    if (value === null) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  // Get P&L color class
  const getPLColorClass = () => {
    if (position.profitLoss === null) return 'text-[var(--text-secondary)]';
    if (position.profitLoss > 0) return 'text-green-500';
    if (position.profitLoss < 0) return 'text-red-500';
    return 'text-[var(--text-secondary)]';
  };

  // Get side badge color
  const getSideBadgeClass = () => {
    return position.side === 'yes'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const eventTitle = position.market?.title || formatMarketTitle('', position.marketTicker);
  const marketSubtitle = position.side === 'yes'
    ? position.market?.yesSubTitle
    : position.market?.noSubTitle;

  const getOutcomeMintForSide = (): string | null => {
    const market = position.market as any;
    if (!market?.accounts) return null;
    // IMPORTANT:
    // Markets can have multiple settlement accounts (e.g. CASH + USDC).
    // For user trading via /order, we must use the outcome mints under the USDC settlement account.
    // Otherwise you can accidentally pick CASH outcome mints and /order will fail.
    const usdcAcct = market.accounts?.[USDC_MINT];
    if (usdcAcct) {
      if (position.side === 'yes' && usdcAcct?.yesMint) return usdcAcct.yesMint;
      if (position.side === 'no' && usdcAcct?.noMint) return usdcAcct.noMint;
    }

    // Fallback: any settlement account (best-effort)
    for (const v of Object.values(market.accounts)) {
      const acct = v as any;
      if (position.side === 'yes' && acct?.yesMint) return acct.yesMint;
      if (position.side === 'no' && acct?.noMint) return acct.noMint;
    }
    // fallback if top-level fields exist
    if (position.side === 'yes' && (market as any).yesMint) return (market as any).yesMint;
    if (position.side === 'no' && (market as any).noMint) return (market as any).noMint;
    return null;
  };

  const getRedeemEligibility = async (): Promise<{ eligible: boolean; settlementMint: string | null; reason?: string }> => {
    const outcomeMint = getOutcomeMintForSide();
    if (!outcomeMint) return { eligible: false, settlementMint: null, reason: 'Missing outcome mint' };

    // Always re-fetch market-by-mint for freshest settlement/redemption flags
    const market = await fetchMarketByMint(outcomeMint);
    const status = (market.status || '').toLowerCase();
    if (status !== 'determined' && status !== 'finalized') {
      return { eligible: false, settlementMint: null, reason: `Market not determined (${market.status})` };
    }

    const accounts = market.accounts as any;
    if (!accounts || typeof accounts !== 'object') {
      return { eligible: false, settlementMint: null, reason: 'Missing market accounts' };
    }

    const getRedemptionStatus = (acct: any): string =>
      String(acct?.redemptionStatus || '').toLowerCase();

    // Prefer USDC if present, else first open redemption account
    const pickOpen = (): { settlementMint: string; acct: any } | null => {
      const usdcAcct = accounts[USDC_MINT];
      if (usdcAcct && getRedemptionStatus(usdcAcct) === 'open') {
        return { settlementMint: USDC_MINT, acct: usdcAcct };
      }
      for (const [mint, acct] of Object.entries(accounts)) {
        if (getRedemptionStatus(acct)) {
          if (getRedemptionStatus(acct) === 'open') {
            return { settlementMint: mint, acct };
          }
        }
      }
      return null;
    };

    const open = pickOpen();
    if (!open) return { eligible: false, settlementMint: null, reason: 'Redemption not open yet' };

    const result = (market.result as string | undefined)?.toLowerCase() || ''; // "yes" | "no" | ""
    const acct = open.acct;

    // Scalar edge-case: result == "" and scalarOutcomePct exists -> both redeemable
    if (result === '' && acct?.scalarOutcomePct !== null && acct?.scalarOutcomePct !== undefined) {
      const isMatch = acct?.yesMint === outcomeMint || acct?.noMint === outcomeMint;
      return { eligible: isMatch, settlementMint: open.settlementMint, reason: isMatch ? undefined : 'Outcome mint mismatch' };
    }

    if (result === 'yes') {
      const isMatch = acct?.yesMint === outcomeMint;
      return { eligible: isMatch, settlementMint: open.settlementMint, reason: isMatch ? undefined : 'Not the winning side' };
    }
    if (result === 'no') {
      const isMatch = acct?.noMint === outcomeMint;
      return { eligible: isMatch, settlementMint: open.settlementMint, reason: isMatch ? undefined : 'Not the winning side' };
    }

    return { eligible: false, settlementMint: null, reason: 'Market result unavailable' };
  };

  const executeOrder = async (params: { inputMint: string; outputMint: string; amountRaw: string }) => {
    if (!walletAddress || !solanaWallet) throw new Error('Wallet not connected');

    const order = await requestOrder({
      userPublicKey: walletAddress,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amountRaw,
      slippageBps: 100,
    });

    const txBase64 = order.transaction || order.openTransaction;
    if (!txBase64) throw new Error('No transaction in order response');

    const txBytes = new Uint8Array(Buffer.from(txBase64, 'base64'));
    const signResult = await signTransaction({
      transaction: txBytes,
      wallet: solanaWallet,
    });

    if (!signResult?.signedTransaction) {
      throw new Error('No signed transaction received');
    }

    const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
      ? signResult.signedTransaction
      : new Uint8Array(signResult.signedTransaction);

    const signedTransaction = VersionedTransaction.deserialize(signedTxBytes);
    const sendWithConnection = (conn: Connection) =>
      conn.sendTransaction(signedTransaction, {
        skipPreflight: true,
        maxRetries: 3,
      });

    let signatureString: string;
    try {
      signatureString = await sendWithConnection(connection);
    } catch (sendError: any) {
      const message = String(sendError?.message || '');
      const isNetworkAbort =
        message.includes('signal is aborted') ||
        message.includes('failed to fetch') ||
        message.includes('NetworkError');

      if (!fallbackConnection || !isNetworkAbort) {
        throw sendError;
      }

      console.warn('[PositionCard] Primary RPC failed, retrying with fallback.');
      signatureString = await sendWithConnection(fallbackConnection);
    }

    // For async orders, wait for DFlow order status
    if (order.executionMode === 'async') {
      // Wait a moment for dflow backend to index the transaction
      await new Promise((r) => setTimeout(r, 2000));
      
      const maxAttempts = 20;
      let attempts = 0;
      let orderNotFoundCount = 0;
      
      while (attempts < maxAttempts) {
        try {
          const st = await getOrderStatus(signatureString);
          if (st.status === 'closed') break;
          if (st.status === 'failed') throw new Error('Execution failed');
          attempts++;
          await new Promise((r) => setTimeout(r, 1500));
        } catch (statusError: any) {
          const errorMsg = statusError.message?.toLowerCase() || '';
          const is404 = errorMsg.includes('404') || 
                       errorMsg.includes('not found') ||
                       errorMsg.includes('failed to get order status');
          
          if (is404) {
            orderNotFoundCount++;
            // If order not found multiple times, dflow might not be tracking this order
            // This can happen if the transaction was submitted directly to Solana
            if (orderNotFoundCount >= 3) {
              console.log('[PositionCard] Order status repeatedly not found, assuming transaction succeeded');
              break;
            }
          }
          
          attempts++;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (attempts >= maxAttempts) {
        console.warn('[PositionCard] Max polling attempts reached. Transaction may still be processing.');
        // Don't throw here - the transaction was submitted, just continue
      }
    }
  };

  const handleSell = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    setActionLoading('sell');
    try {
      console.log('[Sell] Starting sell for position:', {
        marketTicker: position.marketTicker,
        side: position.side,
        balance: position.totalTokenAmount,
      });

      const outcomeMint = getOutcomeMintForSide();
      if (!outcomeMint) {
        console.error('[Sell] Missing outcome mint for position:', position);
        throw new Error('Missing outcome mint');
      }
      console.log('[Sell] Outcome mint:', outcomeMint);

      // Outcome tokens use 6 decimals (per docs)
      const amountRaw = Math.floor(position.totalTokenAmount * 1_000_000).toString();
      if (!amountRaw || amountRaw === '0') {
        console.error('[Sell] Invalid amount:', { totalTokenAmount: position.totalTokenAmount, amountRaw });
        throw new Error('Position size is 0');
      }

      console.log('[Sell] Requesting order:', {
        inputMint: outcomeMint,
        outputMint: USDC_MINT,
        amountRaw,
      });

      const order = await requestOrder({
        userPublicKey: walletAddress!,
        inputMint: outcomeMint,
        outputMint: USDC_MINT,
        amount: amountRaw,
        slippageBps: 100,
      });

      console.log('[Sell] Order received:', {
        inAmount: order.inAmount,
        outAmount: order.outAmount,
        executionMode: order.executionMode,
        hasTransaction: !!(order.transaction || order.openTransaction),
      });

      const txBase64 = order.transaction || order.openTransaction;
      if (!txBase64) {
        console.error('[Sell] No transaction in order response:', order);
        throw new Error('No transaction in order response');
      }

    const txBytes = new Uint8Array(Buffer.from(txBase64, 'base64'));
    const signResult = await signTransaction({
      transaction: txBytes,
      wallet: solanaWallet,
    });

    if (!signResult?.signedTransaction) {
      throw new Error('No signed transaction received');
    }

    const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
      ? signResult.signedTransaction
      : new Uint8Array(signResult.signedTransaction);

    const signedTransaction = VersionedTransaction.deserialize(signedTxBytes);
    const sendWithConnection = (conn: Connection) =>
      conn.sendTransaction(signedTransaction, {
        skipPreflight: true,
        maxRetries: 3,
      });

    let signatureString: string;
    try {
      console.log('[Sell] Sending transaction to blockchain...');
      signatureString = await sendWithConnection(connection);
      console.log('[Sell] Transaction sent:', signatureString);
    } catch (sendError: any) {
      const message = String(sendError?.message || '');
      const isNetworkAbort =
        message.includes('signal is aborted') ||
        message.includes('failed to fetch') ||
        message.includes('NetworkError');

      if (!fallbackConnection || !isNetworkAbort) {
        console.error('[Sell] Transaction send failed:', sendError);
        throw sendError;
      }

      console.warn('[Sell] Primary RPC failed, retrying with fallback.');
      signatureString = await sendWithConnection(fallbackConnection);
      console.log('[Sell] Transaction sent (fallback):', signatureString);
    }

      // For async orders, wait for DFlow order status
      if (order.executionMode === 'async') {
        console.log('[Sell] Waiting for async order to complete...');
        // Wait a moment for dflow backend to index the transaction
        await new Promise((r) => setTimeout(r, 2000));
        
        const maxAttempts = 20;
        let attempts = 0;
        let orderNotFoundCount = 0;
        
        while (attempts < maxAttempts) {
          try {
            const st = await getOrderStatus(signatureString);
            console.log('[Sell] Order status:', st.status, 'attempt', attempts + 1);
            if (st.status === 'closed') {
              console.log('[Sell] Order closed successfully');
              break;
            }
            if (st.status === 'failed') throw new Error('Execution failed');
            attempts++;
            await new Promise((r) => setTimeout(r, 1500));
          } catch (statusError: any) {
            const errorMsg = statusError.message?.toLowerCase() || '';
            const is404 = errorMsg.includes('404') || 
                         errorMsg.includes('not found') ||
                         errorMsg.includes('failed to get order status');
            
            if (is404) {
              orderNotFoundCount++;
              console.log('[Sell] Order status not found, count:', orderNotFoundCount);
              // If order not found multiple times, dflow might not be tracking this order
              // This can happen if the transaction was submitted directly to Solana
              if (orderNotFoundCount >= 3) {
                console.log('[Sell] Order status repeatedly not found, assuming transaction succeeded');
                break;
              }
            }
            
            attempts++;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        if (attempts >= maxAttempts) {
          console.warn('[Sell] Max polling attempts reached. Transaction may still be processing.');
          // Don't throw here - the transaction was submitted, just continue
        }
      } else {
        console.log('[Sell] Sync order completed immediately');
      }

      // Calculate the USDC amount received from the sell
      const receivedUsdc = order.outAmount
        ? Number(order.outAmount) / 1_000_000
        : position.currentValue || 0;

      console.log('[Sell] Sell completed successfully, received:', receivedUsdc, 'USDC');

      triggerPositionsRefresh(); // Trigger global refresh
      onActionComplete?.();

      // Store the sell trade in the database (async, non-blocking)
      // We do this after triggering refresh to not block the UI
      if (!currentUserId) {
        console.error('Cannot save sell trade: currentUserId is null');
      } else {
        fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUserId,
            marketTicker: position.marketTicker,
            eventTicker: position.market?.eventTicker || null,
            side: position.side,
            action: 'SELL',
            amount: receivedUsdc.toFixed(2), // Store USDC received (human-readable)
            executedInAmount: order.inAmount || null, // Actual tokens sold (in smallest unit)
            executedOutAmount: order.outAmount || null, // Actual USDC received (in smallest unit)
            transactionSig: signatureString,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorText = await response.text();
              console.error('Failed to store sell trade - API error:', response.status, errorText);
            } else {
              console.log('Sell trade saved successfully');
            }
          })
          .catch((dbError) => {
            console.error('Failed to store sell trade - Network error:', dbError);
          });
      }
    } catch (err: any) {
      console.error('[Sell] Sell failed:', err);
      setActionError(err.message || 'Sell failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRedeem = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    setActionLoading('redeem');
    try {
      console.log('[Redeem] Starting redemption for position:', {
        marketTicker: position.marketTicker,
        side: position.side,
        balance: position.totalTokenAmount,
      });

      const outcomeMint = getOutcomeMintForSide();
      if (!outcomeMint) {
        console.error('[Redeem] Missing outcome mint for position:', position);
        throw new Error('Missing outcome mint');
      }
      console.log('[Redeem] Outcome mint:', outcomeMint);

      const elig = await getRedeemEligibility();
      console.log('[Redeem] Eligibility check:', elig);
      
      if (!elig.eligible || !elig.settlementMint) {
        throw new Error(elig.reason || 'Not redeemable');
      }

      // Outcome tokens use 6 decimals, so scale to base units.
      const amountRaw = Math.floor(position.totalTokenAmount * 1_000_000).toString();
      if (!amountRaw || amountRaw === '0') {
        console.error('[Redeem] Invalid amount:', { totalTokenAmount: position.totalTokenAmount, amountRaw });
        throw new Error('Position size is 0');
      }

      console.log('[Redeem] Requesting order:', {
        inputMint: outcomeMint,
        outputMint: elig.settlementMint,
        amountRaw,
      });

      if (!walletAddress || !solanaWallet) throw new Error('Wallet not connected');

      // Verify the user actually has the token account with balance
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
        
        const outcomeMintPubkey = new PublicKey(outcomeMint);
        const walletPubkey = new PublicKey(walletAddress);
        
        // Try both Token-2022 and legacy token programs
        let tokenAccount;
        try {
          tokenAccount = await getAssociatedTokenAddress(
            outcomeMintPubkey,
            walletPubkey,
            false,
            TOKEN_2022_PROGRAM_ID
          );
        } catch {
          tokenAccount = await getAssociatedTokenAddress(
            outcomeMintPubkey,
            walletPubkey,
            false,
            TOKEN_PROGRAM_ID
          );
        }
        
        const accountInfo = await connection.getParsedAccountInfo(tokenAccount);
        if (accountInfo.value) {
          const parsed = (accountInfo.value.data as any).parsed;
          const balance = parsed?.info?.tokenAmount?.uiAmount || 0;
          console.log('[Redeem] Current token balance in wallet:', balance, outcomeMint);
          
          if (balance === 0) {
            throw new Error('No tokens found in wallet. The position may have already been redeemed.');
          }
          if (balance < position.totalTokenAmount) {
            console.warn('[Redeem] Wallet balance', balance, 'is less than position', position.totalTokenAmount);
          }
        } else {
          console.warn('[Redeem] Token account not found, transaction may fail');
        }
      } catch (balanceError) {
        console.warn('[Redeem] Could not verify token balance:', balanceError);
        // Don't throw - proceed with redemption attempt
      }

      const order = await requestOrder({
        userPublicKey: walletAddress,
        inputMint: outcomeMint,
        outputMint: elig.settlementMint,
        amount: amountRaw,
        slippageBps: 100,
      });

      console.log('[Redeem] Order received:', {
        inAmount: order.inAmount,
        outAmount: order.outAmount,
        executionMode: order.executionMode,
        hasTransaction: !!(order.transaction || order.openTransaction),
      });

      const txBase64 = order.transaction || order.openTransaction;
      if (!txBase64) {
        console.error('[Redeem] No transaction in order response:', order);
        throw new Error('No transaction in order response');
      }

      const txBytes = new Uint8Array(Buffer.from(txBase64, 'base64'));
      
      console.log('[Redeem] Signing transaction...');
      const signResult = await signTransaction({
        transaction: txBytes,
        wallet: solanaWallet,
      });

      if (!signResult?.signedTransaction) {
        throw new Error('No signed transaction received');
      }

      // Keep the signed transaction as raw bytes - don't deserialize/reserialize
      const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
        ? signResult.signedTransaction
        : new Uint8Array(signResult.signedTransaction);

      console.log('[Redeem] Transaction signed, bytes length:', signedTxBytes.length);
      
      const sendWithConnection = async (conn: Connection) => {
        // Send using sendRawTransaction to avoid any modifications
        return await conn.sendRawTransaction(signedTxBytes, {
          skipPreflight: false, // Enable preflight to catch errors
          maxRetries: 3,
        });
      };

      let signatureString: string;
      try {
        console.log('[Redeem] Sending transaction to blockchain...');
        console.log('[Redeem] Transaction size:', signedTxBytes.length, 'bytes');
        signatureString = await sendWithConnection(connection);
        console.log('[Redeem] Transaction sent, signature:', signatureString);
        console.log('[Redeem] Signature length:', signatureString?.length, 'is valid base58:', /^[1-9A-HJ-NP-Za-km-z]+$/.test(signatureString || ''));
        
        // Validate signature format
        if (!signatureString || signatureString.length < 32 || signatureString === '1111111111111111111111111111111111111111111111111111111111111111') {
          throw new Error(`Invalid transaction signature received: ${signatureString}`);
        }
      } catch (sendError: any) {
        const message = String(sendError?.message || '');
        const isNetworkAbort =
          message.includes('signal is aborted') ||
          message.includes('failed to fetch') ||
          message.includes('NetworkError');

        if (!fallbackConnection || !isNetworkAbort) {
          console.error('[Redeem] Transaction send failed:', sendError);
          throw sendError;
        }

        console.warn('[Redeem] Primary RPC failed, retrying with fallback.');
        signatureString = await sendWithConnection(fallbackConnection);
        console.log('[Redeem] Transaction sent (fallback):', signatureString);
        
        // Validate signature format
        if (!signatureString || signatureString.length < 32 || signatureString === '1111111111111111111111111111111111111111111111111111111111111111') {
          throw new Error(`Invalid transaction signature received from fallback: ${signatureString}`);
        }
      }

      // For async orders, wait for DFlow order status
      if (order.executionMode === 'async') {
        console.log('[Redeem] Waiting for async order to complete...');
        // Wait a moment for dflow backend to index the transaction
        await new Promise((r) => setTimeout(r, 2000));
        
        const maxAttempts = 20;
        let attempts = 0;
        let orderNotFoundCount = 0;
        
        while (attempts < maxAttempts) {
          try {
            const st = await getOrderStatus(signatureString);
            console.log('[Redeem] Order status:', st.status, 'attempt', attempts + 1);
            if (st.status === 'closed') {
              console.log('[Redeem] Order closed successfully');
              break;
            }
            if (st.status === 'failed') throw new Error('Execution failed');
            attempts++;
            await new Promise((r) => setTimeout(r, 1500));
          } catch (statusError: any) {
            const errorMsg = statusError.message?.toLowerCase() || '';
            const is404 = errorMsg.includes('404') || 
                         errorMsg.includes('not found') ||
                         errorMsg.includes('failed to get order status');
            
            if (is404) {
              orderNotFoundCount++;
              console.log('[Redeem] Order status not found, count:', orderNotFoundCount);
              // If order not found multiple times, dflow might not be tracking this order
              // This can happen if the transaction was submitted directly to Solana
              if (orderNotFoundCount >= 3) {
                console.log('[Redeem] Order status repeatedly not found, assuming transaction succeeded');
                break;
              }
            }
            
            attempts++;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        if (attempts >= maxAttempts) {
          console.warn('[Redeem] Max polling attempts reached. Transaction may still be processing.');
          // Don't throw here - the transaction was submitted, just continue
        }
      } else {
        console.log('[Redeem] Sync order completed immediately');
      }

      // Wait for transaction confirmation on-chain with extended timeout
      console.log('[Redeem] Waiting for transaction confirmation...');
      let transactionConfirmed = false;
      try {
        // Use a more robust confirmation strategy with longer timeout
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        await connection.confirmTransaction({
          signature: signatureString,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, 'confirmed');
        console.log('[Redeem] Transaction confirmed on-chain');
        transactionConfirmed = true;
      } catch (confirmError: any) {
        console.warn('[Redeem] Confirmation check failed:', confirmError);
        // Check transaction status as fallback
        try {
          const status = await connection.getSignatureStatus(signatureString, {
            searchTransactionHistory: true,
          });
          if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
            console.log('[Redeem] Transaction found and confirmed via status check');
            transactionConfirmed = true;
          } else if (status?.value?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
          } else {
            console.warn('[Redeem] Transaction status unknown, will proceed with refresh');
            transactionConfirmed = false;
          }
        } catch (statusError) {
          console.warn('[Redeem] Could not verify transaction status:', statusError);
          transactionConfirmed = false;
        }
      }

      // Calculate the settlement amount received from the redemption
      const receivedSettlement = order.outAmount
        ? Number(order.outAmount) / 1_000_000
        : position.totalTokenAmount; // For 1:1 redemptions

      console.log('[Redeem] Redemption completed, received:', receivedSettlement, 'tokens, confirmed:', transactionConfirmed);
      
      // Wait a bit before refreshing to allow blockchain to update
      await new Promise((r) => setTimeout(r, 1000));
      
      triggerPositionsRefresh();
      onActionComplete?.();

      // Store the redeem trade in the database (async, non-blocking)
      // Note: We use action='SELL' because the schema only supports BUY/SELL
      // Redemption is functionally a sell (converting tokens to settlement currency)
      if (!currentUserId) {
        console.error('Cannot save redeem trade: currentUserId is null');
      } else {
        fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUserId,
            marketTicker: position.marketTicker,
            eventTicker: position.market?.eventTicker || null,
            side: position.side,
            action: 'SELL', // Use SELL for redemptions (schema limitation)
            amount: receivedSettlement.toFixed(2), // Store settlement received (human-readable)
            executedInAmount: order.inAmount || null, // Actual tokens redeemed (in smallest unit)
            executedOutAmount: order.outAmount || null, // Actual settlement received (in smallest unit)
            transactionSig: signatureString,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorText = await response.text();
              console.error('Failed to store redeem trade - API error:', response.status, errorText);
            } else {
              console.log('Redeem trade saved successfully');
            }
          })
          .catch((dbError) => {
            console.error('Failed to store redeem trade - Network error:', dbError);
          });
      }
    } catch (err: any) {
      console.error('[Redeem] Error:', err);
      setActionError(err.message || 'Redeem failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    setActionLoading('close');
    try {
      if (!walletAddress || !solanaWallet) throw new Error('Wallet not connected');

      const tokenAccountAddress = (position as any).tokenAccountAddress;
      const mint = position.outcomeMint || getOutcomeMintForSide();
      const rawBalance = (position as any).rawBalance || Math.floor(position.totalTokenAmount * 1_000_000).toString();

      if (!tokenAccountAddress || !mint) {
        throw new Error('Missing token account address or mint');
      }

      console.log('[Close] Building close transaction:', {
        walletAddress,
        tokenAccountAddress,
        mint,
        rawBalance,
      });

      const res = await fetch('/api/positions/close-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, tokenAccountAddress, mint, rawBalance }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to build close transaction');
      }

      const { transaction: txBase64 } = await res.json();
      const txBytes = Buffer.from(txBase64, 'base64');

      const signResult = await signTransaction({
        transaction: new Uint8Array(txBytes),
        wallet: solanaWallet,
      });

      if (!signResult?.signedTransaction) throw new Error('Transaction signing cancelled');

      const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
        ? signResult.signedTransaction
        : new Uint8Array(signResult.signedTransaction);

      // This is a legacy Transaction (not Versioned)
      const { Transaction: LegacyTransaction } = await import('@solana/web3.js');
      const signedTx = LegacyTransaction.from(signedTxBytes);

      const sendWithConnection = (conn: Connection) =>
        conn.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true,
          maxRetries: 3,
        });

      let sig: string;
      try {
        sig = await sendWithConnection(connection);
      } catch (sendError: any) {
        const msg = String(sendError?.message || '');
        if (fallbackConnection && (msg.includes('signal is aborted') || msg.includes('failed to fetch') || msg.includes('NetworkError'))) {
          sig = await sendWithConnection(fallbackConnection);
        } else {
          throw sendError;
        }
      }

      console.log('[Close] Transaction sent:', sig);

      // Wait for confirmation
      await connection.confirmTransaction(sig, 'confirmed').catch(() => {});

      triggerPositionsRefresh();
      onActionComplete?.();
    } catch (err: any) {
      console.error('[Close] Error:', err);
      setActionError(err.message || 'Close failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Determine action based on category (from on-chain data) or market status fallback
  const marketStatus = (position.market?.status || '').toLowerCase();
  const marketResult = ((position.market as any)?.result || '').toLowerCase();

  // When category is explicitly provided from on-chain data, use it as truth
  const shouldOfferClose = category === 'closeable';
  const shouldOfferRedeem = category === 'redeemable' || (
    !shouldOfferClose && !category &&
    (marketStatus === 'determined' || marketStatus === 'finalized' || marketResult === 'yes' || marketResult === 'no')
  );

  // Allow actions on ALL categorised positions — including closeable in previous tab
  const canShowActions = allowActions && !!position.market && (
    category ? ['active', 'redeemable', 'closeable'].includes(category) : !isPrevious
  );

  // Get the outcome result for previous positions
  const getOutcomeResult = () => {
    if (!isPrevious) return null;
    const market = position.market;
    if (!market) return 'Closed';

    const result = (market as any).result?.toLowerCase();
    if (result === 'yes' || result === 'no') {
      const userWon = result === position.side;
      return userWon ? 'Won' : 'Lost';
    }

    // Position was sold (zero balance) or market closed
    if (position.totalTokenAmount === 0) {
      return 'Sold';
    }

    return 'Closed';
  };

  const outcomeResult = getOutcomeResult();

  // Get border color based on P&L and whether it's previous
  const getBorderColorClass = () => {
    if (isPrevious) {
      // Muted styling for previous positions
      return 'border-[var(--border-color)]/50';
    }
    if (position.profitLoss === null) return 'border-[var(--border-color)]';
    if (position.profitLoss > 0) return 'border-green-500/30 hover:border-green-500/50';
    if (position.profitLoss < 0) return 'border-red-500/30 hover:border-red-500/50';
    return 'border-[var(--border-color)]';
  };

  // Get the outcome badge color for previous positions
  const getOutcomeBadgeClass = () => {
    if (outcomeResult === 'Won') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (outcomeResult === 'Lost') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (outcomeResult === 'Sold') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-[var(--surface-hover)] text-[var(--text-tertiary)] border-[var(--border-color)]';
  };

  return (
    <div
      onClick={handleClick}
      className={`p-3 rounded-xl bg-[var(--card-bg)] border ${getBorderColorClass()} hover:shadow-lg transition-all cursor-pointer group ${isPrevious ? 'opacity-75 hover:opacity-90' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Event Image */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-white/20 to-gray-400/20 border border-[var(--border-color)]">
          {position.eventImageUrl ? (
            <img
              src={position.eventImageUrl}
              alt={eventTitle}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center text-lg">📊</div>';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg">
              📊
            </div>
          )}
        </div>

        {/* Position Details */}
        <div className="flex-1 min-w-0">
          {/* Header Row: Title + Action Button */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-white transition-colors flex-1">
              {eventTitle}
            </h3>

            {/* Compact Action Button in Header */}
            {canShowActions && (
              <button
                onClick={shouldOfferClose ? handleClose : shouldOfferRedeem ? handleRedeem : handleSell}
                disabled={actionLoading !== null}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${shouldOfferClose
                  ? 'bg-gradient-to-r from-gray-500 to-gray-400 text-white hover:from-gray-400 hover:to-gray-300'
                  : shouldOfferRedeem
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400'
                    : 'bg-white/90 text-black hover:bg-white'
                  }`}
              >
                {actionLoading === 'sell' || actionLoading === 'redeem' || actionLoading === 'close'
                  ? '...'
                  : shouldOfferClose ? 'Close' : shouldOfferRedeem ? 'Redeem' : 'Sell'}
              </button>
            )}

            {/* Outcome Badge for Previous Positions */}
            {isPrevious && outcomeResult && (
              <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getOutcomeBadgeClass()}`}>
                {outcomeResult === 'Won' && '🏆'}
                {outcomeResult === 'Lost' && '❌'}
                {outcomeResult === 'Sold' && '💰'}
                {outcomeResult}
              </span>
            )}
          </div>

          {/* Side Badge + Trade Count */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSideBadgeClass()}`}>
              {position.side.toUpperCase()}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {position.tradeCount} trade{position.tradeCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Compact Stats Row */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* Current Value */}
              {!isPrevious && (
                <div>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">Value</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatCurrency(position.currentValue)}
                  </span>
                </div>
              )}

              {/* Cost Basis */}
              {position.totalCostBasis > 0 && (
                <div>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">Cost</span>
                  <span className="text-[var(--text-secondary)]">
                    {formatCurrency(position.totalCostBasis)}
                  </span>
                </div>
              )}

              {/* Total P&L (Realized + Unrealized) */}
              {position.totalPnL !== null && position.totalPnL !== undefined && (
                <div>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">P&L</span>
                  <span className={`font-semibold ${getPLColorClass()}`}>
                    {position.totalPnL >= 0 ? '+' : ''}{formatCurrency(position.totalPnL)}
                    {position.profitLossPercentage !== null && (
                      <span className="ml-1 text-[10px] opacity-80">
                        ({formatPercentage(position.profitLossPercentage)})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Realized/Unrealized Breakdown (subtle, right-aligned) */}
            <div className="text-right">
              {position.realizedPnL !== 0 && (
                <div className="text-[10px]">
                  <span className="text-[var(--text-tertiary)]">Realized: </span>
                  <span className={position.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {position.realizedPnL >= 0 ? '+' : ''}{formatCurrency(position.realizedPnL)}
                  </span>
                </div>
              )}
              {position.unrealizedPnL !== null && position.unrealizedPnL !== undefined && (
                <div className="text-[10px]">
                  <span className="text-[var(--text-tertiary)]">Unrealized: </span>
                  <span className={position.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {position.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {actionError && (
            <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
              {actionError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

