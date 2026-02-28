'use client';

import { useState, useEffect, useRef } from 'react';
import { usePrivy, useWallets, useSessionSigners } from '@privy-io/react-auth';
import { useCreateWallet, useFundWallet, useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { USDC_MINT } from '../lib/tradeApi';
import UserTrades from './UserTrades';
import UserPositionsEnhanced from './UserPositionsEnhanced';
import CreditCard from './CreditCard';
import { useTheme } from './ThemeProvider';
import FollowersFollowingModal from './FollowersFollowingModal';
import { useAppData } from '../contexts/AppDataContext';
import { fetchUserCounts } from '../lib/authSync';
import { normalizeTwitterAvatarUrl } from '@/lib/utils';
import {
  closeJupiterPosition,
  fetchJupiterPositions,
  formatMicroUsd,
  persistJupiterTrade,
  toUsdDecimalString,
  type JupiterPosition,
  waitForConfirmedSignature,
} from '../lib/jupiter-prediction';
import { JUPITER_JUPUSD_MINT } from '../lib/jupiter-prediction';

export default function Profile() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { removeSessionSigners } = useSessionSigners();
  const { signTransaction } = useSignTransaction();
  const { createWallet } = useCreateWallet();
  const { fundWallet } = useFundWallet({
    onUserExited() {
      // Modal has been closed by the user
    },
  });
  const { theme } = useTheme();
  const { currentUserId, userCounts, updateUserCounts, isUserLoading } = useAppData();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [jupUsdBalance, setJupUsdBalance] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [tradesCount, setTradesCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'followers' | 'following'>('followers');
  const [removingSigners, setRemovingSigners] = useState(false);
  const [signerRemovalSuccess, setSignerRemovalSuccess] = useState(false);
  const [jupiterPositions, setJupiterPositions] = useState<JupiterPosition[]>([]);
  const [jupiterLoading, setJupiterLoading] = useState(false);
  const [jupiterError, setJupiterError] = useState<string | null>(null);
  const [jupiterTab, setJupiterTab] = useState<'active' | 'all'>('active');
  const [sellingPositionPubkey, setSellingPositionPubkey] = useState<string | null>(null);

  // Get counts from context
  const followersCount = userCounts?.followerCount ?? 0;
  const followingCount = userCounts?.followingCount ?? 0;

  // Check if HTTPS is available (required for embedded wallets)
  const isHttpsAvailable = () => {
    if (typeof window === 'undefined') return false;
    return window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  };

  // Get wallet address from multiple sources with polling
  useEffect(() => {
    if (!authenticated || !user) {
      setWalletAddress(null);
      return;
    }

    const checkForWallet = () => {
      // First, try to get from wallets array
      const solanaWallets = wallets.filter((wallet) => {
        if (wallet.walletClientType === 'privy') return true;
        if (wallet.address && !wallet.address.startsWith('0x') && wallet.address.length >= 32) {
          return true;
        }
        return false;
      });

      const solanaWallet = solanaWallets.find(
        (wallet) => wallet.walletClientType === 'privy'
      ) || solanaWallets[0];

      if (solanaWallet?.address) {
        console.log('[Profile] Found wallet in wallets array:', solanaWallet.address);
        setWalletAddress(solanaWallet.address);
        return true;
      }

      // Fallback: try to get from user's linked accounts
      if (user?.linkedAccounts) {
        const embeddedWallet = user.linkedAccounts.find(
          (account) => account.type === 'wallet' &&
            'walletClientType' in account &&
            account.walletClientType === 'privy' &&
            'address' in account
        ) as any;

        if (embeddedWallet?.address) {
          console.log('[Profile] Found wallet in linked accounts (embedded):', embeddedWallet.address);
          setWalletAddress(embeddedWallet.address);
          return true;
        }

        // Last resort: check all linked accounts for Solana addresses
        const solanaAccount = user.linkedAccounts.find(
          (account) => account.type === 'wallet' &&
            'address' in account &&
            account.address &&
            typeof account.address === 'string' &&
            !account.address.startsWith('0x') &&
            account.address.length >= 32
        ) as any;

        if (solanaAccount?.address) {
          console.log('[Profile] Found wallet in linked accounts (Solana):', solanaAccount.address);
          setWalletAddress(solanaAccount.address);
          return true;
        }
      }

      console.log('[Profile] No wallet found');
      return false;
    };

    // Check immediately
    if (checkForWallet()) {
      return;
    }

    // Poll for wallet creation (check every 2 seconds for up to 30 seconds)
    let pollCount = 0;
    const maxPolls = 15;

    const pollInterval = setInterval(() => {
      pollCount++;
      if (checkForWallet() || pollCount >= maxPolls) {
        clearInterval(pollInterval);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [authenticated, user, wallets]);

  // Create connection only on client side
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = typeof window !== 'undefined' ? new Connection(rpcUrl, 'confirmed') : null;

  // Fetch follower/following counts and trades count in background (non-blocking)
  useEffect(() => {
    if (currentUserId) {
      fetchProfileStats();
    }
  }, [currentUserId]);

  // Fetch SOL price
  useEffect(() => {
    fetchSolPrice();
    // Refresh price every 5 minutes
    const priceInterval = setInterval(fetchSolPrice, 5 * 60 * 1000);
    return () => clearInterval(priceInterval);
  }, []);

  // Fetch SOL balance
  useEffect(() => {
    if (walletAddress && authenticated) {
      fetchBalance();
    }
  }, [walletAddress, authenticated]);

  // Fetch Jupiter positions for the connected wallet (My Profile).
  useEffect(() => {
    if (!walletAddress || !authenticated) {
      setJupiterPositions([]);
      setJupiterError(null);
      return;
    }
    let cancelled = false;
    setJupiterLoading(true);
    setJupiterError(null);
    fetchJupiterPositions(walletAddress)
      .then((res) => {
        if (!cancelled) setJupiterPositions(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setJupiterPositions([]);
          setJupiterError(err instanceof Error ? err.message : 'Failed to load Jupiter positions');
        }
      })
      .finally(() => {
        if (!cancelled) setJupiterLoading(false);
      });
    return () => { cancelled = true; };
  }, [walletAddress, authenticated]);

  const fetchSolPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (response.ok) {
        const data = await response.json();
        setSolPrice(data.solana?.usd || null);
      }
    } catch (err) {
      console.error('Error fetching SOL price:', err);
    }
  };

  const refreshJupiterPositions = async () => {
    if (!walletAddress || !authenticated) return;
    setJupiterLoading(true);
    setJupiterError(null);
    try {
      const res = await fetchJupiterPositions(walletAddress);
      setJupiterPositions(res.data ?? []);
    } catch (err: unknown) {
      setJupiterPositions([]);
      setJupiterError(err instanceof Error ? err.message : 'Failed to load Jupiter positions');
    } finally {
      setJupiterLoading(false);
    }
  };

  const handleSellJupiterPosition = async (position: JupiterPosition) => {
    if (!walletAddress) {
      setJupiterError('Wallet not connected');
      return;
    }
    const activeWallet = solanaWallets.find((w) => w.address === walletAddress) ?? solanaWallets[0];
    if (!activeWallet) {
      setJupiterError('No active wallet available for signing');
      return;
    }

    setSellingPositionPubkey(position.pubkey);
    setJupiterError(null);
    try {
      const res = await closeJupiterPosition({
        positionPubkey: position.pubkey,
        ownerPubkey: walletAddress,
      });
      if (!res.transaction) throw new Error('No transaction returned from Jupiter');

      const txBytes = new Uint8Array(Buffer.from(res.transaction, 'base64'));
      const signResult = await signTransaction({
        transaction: txBytes,
        wallet: activeWallet,
      });
      if (!signResult?.signedTransaction) throw new Error('No signed transaction received');

      const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
        ? signResult.signedTransaction
        : new Uint8Array(signResult.signedTransaction);

      const signedTx = VersionedTransaction.deserialize(signedTxBytes);
      if (!connection) throw new Error('RPC connection unavailable');
      const signature = await connection.sendTransaction(signedTx, { skipPreflight: true, maxRetries: 3 });
      await waitForConfirmedSignature(connection, signature);

      const executedInAmount = String(res.order?.contracts ?? position.contracts ?? '');
      const executedOutAmount = String(res.order?.orderCostUsd ?? position.payoutUsd ?? position.valueUsd ?? '');
      const amountUsd = toUsdDecimalString(executedOutAmount);
      const numericEntryPrice = Number(res.order?.minSellPriceUsd);
      const entryPrice = Number.isFinite(numericEntryPrice) ? numericEntryPrice : undefined;

      if (!amountUsd) {
        throw new Error('Unable to determine sell proceeds for persistence');
      }

      await persistJupiterTrade({
        ownerPubkey: walletAddress,
        marketId: position.marketId,
        eventId: position.eventId,
        marketIdHash: res.order?.marketIdHash,
        isYes: position.isYes,
        isBuy: false,
        amount: amountUsd,
        executedInAmount,
        executedOutAmount,
        transactionSig: signature,
        entryPrice,
        externalOrderId: res.externalOrderId,
        orderPubkey: res.order?.orderPubkey,
        positionPubkey: position.pubkey,
      });

      await refreshJupiterPositions();
    } catch (err: unknown) {
      setJupiterError(err instanceof Error ? err.message : 'Failed to sell position');
    } finally {
      setSellingPositionPubkey(null);
    }
  };

  const fetchProfileStats = async (skipCache: boolean = false) => {
    if (!currentUserId) return;

    try {
      const [userCounts, tradesRes] = await Promise.all([
        fetchUserCounts(currentUserId),
        fetch(`/api/trades?userId=${currentUserId}&limit=1`, skipCache ? { cache: 'no-store' } : {}),
      ]);

      if (userCounts) {
        // Update context with fresh counts
        updateUserCounts(userCounts);
      }

      if (tradesRes.ok) {
        const trades = await tradesRes.json();
        setTradesCount(trades.length);
      }
    } catch (error) {
      console.error('Error fetching profile stats:', error);
    }
  };

  // Optimistic count update callback for follow/unfollow actions
  const handleFollowChange = (isFollowing: boolean) => {
    if (!currentUserId) return;

    // Optimistically update following count immediately via context
    const newCount = isFollowing ? followingCount + 1 : Math.max(0, followingCount - 1);
    updateUserCounts({ followingCount: newCount });

    // Refresh from server to sync after a delay
    setTimeout(() => {
      fetchProfileStats(true);
    }, 800);

    // Second refresh for consistency
    setTimeout(() => {
      fetchProfileStats(true);
    }, 2000);
  };

  const handleSearchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Search by wallet address (exact match) or display name (partial match)
      const response = await fetch(`/api/users/search?walletAddress=${encodeURIComponent(searchQuery.trim())}`);
      if (response.ok) {
        const users = await response.json();
        setSearchResults(users);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleRemoveSigners = async () => {
    if (!authenticated || !walletAddress) return;

    setRemovingSigners(true);
    setSignerRemovalSuccess(false);
    setError(null);

    try {
      // Use the official Privy removeSigners method
      await removeSessionSigners({ address: walletAddress });
      
      console.log('Signers removed successfully');
      setSignerRemovalSuccess(true);
      
      // Hide success message after 5 seconds
      setTimeout(() => {
        setSignerRemovalSuccess(false);
      }, 5000);
    } catch (err: any) {
      console.error('Error removing signers:', err);
      setError(err.message || 'Failed to remove signers');
    } finally {
      setRemovingSigners(false);
    }
  };

  const fetchBalance = async () => {
    if (!walletAddress || !connection) return;

    setLoading(true);
    setError(null);

    try {
      const publicKey = new PublicKey(walletAddress);

      // Fetch SOL balance
      const balance = await connection.getBalance(publicKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);

      // Fetch USDC balance
      try {
        const usdcMint = new PublicKey(USDC_MINT);
        const usdcTokenAddress = await getAssociatedTokenAddress(
          usdcMint,
          publicKey
        );

        const usdcAccount = await getAccount(connection, usdcTokenAddress);
        // USDC has 6 decimals
        const usdcBal = Number(usdcAccount.amount) / 1_000_000;
        setUsdcBalance(usdcBal);
      } catch (usdcErr) {
        // If USDC account doesn't exist, set balance to 0
        console.log('No USDC account found, setting balance to 0');
        setUsdcBalance(0);
      }

      // Fetch JupUSD balance
      try {
        const jupUsdMint = new PublicKey(JUPITER_JUPUSD_MINT);
        const jupUsdTokenAddress = await getAssociatedTokenAddress(
          jupUsdMint,
          publicKey
        );

        const jupUsdAccount = await getAccount(connection, jupUsdTokenAddress);
        // JupUSD uses 6 decimals
        const jupUsdBal = Number(jupUsdAccount.amount) / 1_000_000;
        setJupUsdBalance(jupUsdBal);
      } catch (jupUsdErr) {
        // If JupUSD account doesn't exist, set balance to 0
        console.log('No JupUSD account found, setting balance to 0');
        setJupUsdBalance(0);
      }
    } catch (err: any) {
      setError('Failed to fetch balance');
      console.error('Error fetching balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const getUserDisplayName = () => {
    if (user?.twitter?.username) {
      return `@${user.twitter.username}`;
    }
    if (user?.google?.email) {
      return user.google.email.split('@')[0];
    }
    return 'User';
  };

  const getUserHandle = () => {
    // Format handle like "$vzy010" - use wallet address or username
    if (walletAddress) {
      return `$${walletAddress.slice(0, 3)}${walletAddress.slice(-3)}`;
    }
    if (user?.twitter?.username) {
      return `@${user.twitter.username}`;
    }
    return '$user';
  };

  const getUserAvatar = () => {
    if (user?.twitter?.profilePictureUrl) {
      return normalizeTwitterAvatarUrl(user.twitter.profilePictureUrl) || '/default.png';
    }
    return '/default.png';
  };

  const getUserEmail = () => {
    if (user?.google?.email) {
      return user.google.email;
    }
    // Twitter doesn't provide email in Privy
    return null;
  };

  if (!ready || !authenticated) {
    return null;
  }

  const activeJupiterPositions = jupiterPositions.filter((pos) => {
    const status = pos.marketMetadata?.status?.toLowerCase();
    if (status === 'open') return true;
    if (status === 'resolved' || status === 'closed') return false;
    return !pos.claimable && !pos.claimed;
  });
  const displayedJupiterPositions = jupiterTab === 'active' ? activeJupiterPositions : jupiterPositions;

  return (
    <>
      <div className="backdrop-blur-sm rounded-2xl p-6">
        {/* User Info Section - New Layout */}
        <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
          <div className="flex items-start gap-4">
            {/* Left Side: Profile Picture and Info */}
            <div className="flex items-start gap-4 flex-1">
              {/* Profile Picture */}
              <div className="relative flex-shrink-0">
                <img
                  src={getUserAvatar()}
                  alt="Profile"
                  className="w-16 h-16 rounded-full border-2 border-gray-400/50 shadow-[0_0_20px_var(--glow-cyan)]"
                />
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col">
                {/* Handle - to the right of profile picture */}


                {/* Name with Dropdown and Unverified Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {getUserDisplayName()}
                  </h3>

                </div>

                {/* Follower/Following Counts */}
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <button
                    onClick={() => {
                      setModalType('followers');
                      setModalOpen(true);
                    }}
                    className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer text-lg"
                  >
                    <span>{followersCount}</span>{' '}
                    <span className="opacity-60">{followersCount !== 1 ? 'Followers' : 'Follower'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setModalType('following');
                      setModalOpen(true);
                    }}
                    className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer text-lg"
                  >
                    <span>{followingCount}</span>{' '}
                    <span className="opacity-60">Following</span>
                  </button>
                  {walletAddress && (
                    <button
                      onClick={async () => {
                        if (walletAddress) {
                          try {
                            await fundWallet({
                              address: walletAddress,
                            });
                            // Refresh balance after deposit
                            setTimeout(() => {
                              fetchBalance();
                            }, 2000);
                          } catch (err) {
                            console.error('Fund wallet error:', err);
                          }
                        }
                      }}
                      className="hidden md:flex px-4 py-1.5 bg-gradient-to-r bg-slate-200 text-black rounded-lg transition-all font-medium text-lg items-center gap-2 shadow-md hover:shadow-lg active:scale-95"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Cash
                    </button>
                  )}
                  {/* Temporary Fix Wallet Signer Button */}
                  {walletAddress && (
                    <button
                      onClick={handleRemoveSigners}
                      disabled={removingSigners}
                      className="hidden md:flex px-4 py-1.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg transition-all font-medium text-sm items-center gap-2 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {removingSigners ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Fixing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Fix Wallet Signer
                        </>
                      )}
                    </button>
                  )}
                </div>
                {/* Success/Error Messages */}
                {signerRemovalSuccess && (
                  <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-xs">✅ Wallet signers removed successfully!</p>
                  </div>
                )}
                {error && error.includes('signer') && (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side Stats */}

          </div>

          {/* Verify Profile Button */}

        </div>

        {/* Wallet Creation Section (only shown if no wallet) */}
        {!walletAddress && (
          <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
            <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wider">
              Solana Wallet
            </h4>
            <div className="bg-[var(--card-bg)]/30 rounded-xl p-6 border border-[var(--border-color)]">
              {creatingWallet ? (
                <div className="flex flex-col items-center justify-center gap-4 py-4">
                  <svg className="w-8 h-8 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-yellow-300 text-sm font-medium">
                    Creating your wallet...
                  </p>
                  <p className="text-[var(--text-tertiary)] text-xs text-center max-w-sm">
                    This usually takes just a few seconds. Please wait...
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-4">
                  <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-2">
                    <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-[var(--text-secondary)] text-sm text-center mb-1">
                    No wallet found
                  </p>
                  <p className="text-[var(--text-tertiary)] text-xs text-center max-w-sm mb-4">
                    Create a Solana wallet to start trading on prediction markets
                  </p>
                  <button
                    onClick={async () => {
                      setCreatingWallet(true);
                      setError(null);

                      // Check if HTTPS is available
                      if (!isHttpsAvailable()) {
                        setError('Embedded wallets require HTTPS. Please use HTTPS or deploy to a staging environment.');
                        setCreatingWallet(false);
                        return;
                      }

                      try {
                        await createWallet();
                        // Wait a moment and check again
                        setTimeout(() => {
                          setCreatingWallet(false);
                        }, 5000);
                      } catch (err: any) {
                        const errorMessage = err?.message || 'Failed to create wallet';
                        if (errorMessage.includes('HTTPS') || errorMessage.includes('https')) {
                          setError('Embedded wallets require HTTPS. Please use HTTPS or deploy to a staging environment.');
                        } else {
                          setError(errorMessage);
                        }
                        setCreatingWallet(false);
                        console.error('Wallet creation error:', err);
                      }
                    }}
                    disabled={creatingWallet}
                    className="px-6 py-3 bg-gradient-to-r from-yellow-600 to-teal-600 hover:from-yellow-500 hover:to-teal-500 text-white rounded-xl transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingWallet ? 'Creating...' : 'Create Solana Wallet'}
                  </button>
                  {error && (
                    <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-red-400 text-xs text-center">{error}</p>
                      {error.includes('HTTPS') && (
                        <p className="text-red-300/70 text-xs text-center mt-2">
                          For local development, you can use tools like{' '}
                          <a
                            href="https://github.com/FiloSottile/mkcert"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-red-200"
                          >
                            mkcert
                          </a>
                          {' '}to enable HTTPS on localhost.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Credit Card Style Stats */}
        <CreditCard
          theme={theme}
          loading={loading}
          error={error}
          solBalance={solBalance}
          usdcBalance={usdcBalance}
          jupUsdBalance={jupUsdBalance}
          solPrice={solPrice}
          tradesCount={tradesCount}
          username={getUserDisplayName()}
          walletAddress={walletAddress || undefined}
          showBreakdown={false}
          showStats={true}
        />

        {/* User Positions Section */}
        {currentUserId && (
          <div className="mb-6">
            <UserPositionsEnhanced userId={currentUserId} allowActions walletAddress={walletAddress} />
          </div>
        )}

        {/* Jupiter Positions Section (from Jupiter Prediction API) */}
        {walletAddress && (
          <div className="mb-6 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-[var(--text-primary)]">Jupiter Positions</h3>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--border-color)]">
                <button
                  onClick={() => setJupiterTab('active')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    jupiterTab === 'active'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Active ({activeJupiterPositions.length})
                </button>
                <button
                  onClick={() => setJupiterTab('all')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    jupiterTab === 'all'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All ({jupiterPositions.length})
                </button>
              </div>
            </div>

            {jupiterLoading && (
              <div className="h-20 rounded-xl bg-[var(--surface)] animate-pulse" />
            )}
            {!jupiterLoading && jupiterError && (
              <p className="text-sm text-red-400">{jupiterError}</p>
            )}
            {!jupiterLoading && !jupiterError && displayedJupiterPositions.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)]">
                {jupiterTab === 'active' ? 'No active Jupiter positions.' : 'No Jupiter positions.'}
              </p>
            )}
            {!jupiterLoading && displayedJupiterPositions.length > 0 && (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {displayedJupiterPositions.map((position) => (
                  <JupiterPositionRow
                    key={position.pubkey}
                    position={position}
                    onSell={() => handleSellJupiterPosition(position)}
                    selling={sellingPositionPubkey === position.pubkey}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* User Discovery Section */}
      </div>

      {/* Followers/Following Modal */}
      <FollowersFollowingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={currentUserId || ''}
        type={modalType}
        currentUserId={currentUserId}
      />
    </>
  );
}

function JupiterPositionRow({
  position,
  onSell,
  selling,
}: {
  position: JupiterPosition;
  onSell: () => void;
  selling: boolean;
}) {
  const eventTitle = position.eventMetadata?.title ?? position.eventId ?? '—';
  const marketTitle = position.marketMetadata?.title ?? position.marketId ?? '—';
  const side = position.isYes ? 'Yes' : 'No';
  const pnl = position.pnlUsd != null ? parseFloat(String(position.pnlUsd)) : null;
  const pnlFormatted = pnl != null ? formatMicroUsd(pnl) : '—';
  const pnlPercent = position.pnlUsdPercent ?? null;
  const valueFormatted = formatMicroUsd(position.valueUsd ?? position.sizeUsd);
  const contracts = position.contracts ?? '—';
  const sellPriceFormatted = formatMicroUsd(position.sellPriceUsd);
  const isPositive = pnl != null && pnl >= 0;

  return (
    <div className="py-3 border-b border-[var(--border-color)]/50 last:border-0">
      <div className="flex items-start gap-2">
        <div
          className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${
            position.isYes ? 'bg-[var(--accent-yes)]/20 text-[var(--accent-yes)]' : 'bg-pink-500/20 text-pink-400'
          }`}
        >
          {side}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text-primary)] text-sm truncate" title={marketTitle}>
            {marketTitle}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] truncate" title={eventTitle}>
            {eventTitle}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span className="text-[var(--text-secondary)]">
              {contracts} contracts · {valueFormatted}
            </span>
            <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
              P&L {pnlFormatted}
              {pnlPercent != null ? ` (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)` : ''}
            </span>
            <span className="text-[var(--text-tertiary)]">Sell: {sellPriceFormatted}</span>
          </div>
          <div className="mt-2">
            <button
              onClick={onSell}
              disabled={selling}
              className="px-2.5 py-1.5 text-xs rounded-md bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selling ? 'Selling...' : 'Sell Position'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// User Search Result Component
function UserSearchResult({
  user,
  currentUserId,
  onFollowChange,
}: {
  user: any;
  currentUserId: string | null;
  onFollowChange: (isFollowing: boolean) => void;
}) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!currentUserId || currentUserId === user.id) {
      setChecking(false);
      return;
    }

    const checkFollowing = async () => {
      try {
        const followingRes = await fetch(`/api/follow/following?userId=${currentUserId}`);
        if (followingRes.ok) {
          const following = await followingRes.json();
          const followingIds = following.map((f: any) => f.following.id);
          setIsFollowing(followingIds.includes(user.id));
        }
      } catch (error) {
        console.error('Error checking follow status:', error);
      } finally {
        setChecking(false);
      }
    };

    checkFollowing();
  }, [currentUserId, user.id]);

  const handleFollow = async () => {
    if (!currentUserId || currentUserId === user.id || loading) return;

    const wasFollowing = isFollowing;

    // Optimistic UI update
    setIsFollowing(!wasFollowing);

    setLoading(true);
    try {
      if (wasFollowing) {
        await fetch('/api/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerId: currentUserId,
            followingId: user.id,
          }),
        });
      } else {
        await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerId: currentUserId,
            followingId: user.id,
          }),
        });
      }
      // Call optimistic count update callback
      onFollowChange(!wasFollowing);
    } catch (error) {
      console.error('Error following/unfollowing:', error);
      // Rollback optimistic update on error
      setIsFollowing(wasFollowing);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="bg-[var(--card-bg)]/30 rounded-lg p-3 border border-[var(--border-color)]">
        <div className="h-4 w-24 bg-[var(--surface-hover)] rounded animate-pulse" />
      </div>
    );
  }

  if (currentUserId === user.id) {
    return null; // Don't show self in search results
  }

  const displayName = user.displayName || `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`;

  return (
    <div className="bg-[var(--card-bg)]/30 rounded-lg p-3 border border-[var(--border-color)] flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img
          src={user.avatarUrl || '/default.png'}
          alt={displayName}
          className="w-8 h-8 rounded-full border border-yellow-500/30"
        />
        <div>
          <p className="text-[var(--text-primary)] text-sm font-medium">{displayName}</p>
          <p className="text-[var(--text-tertiary)] text-xs font-mono">{user.walletAddress.slice(0, 8)}...</p>
        </div>
      </div>
      <button
        onClick={handleFollow}
        disabled={loading}
        className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${isFollowing
          ? 'bg-[var(--surface-hover)] hover:bg-[var(--input-bg)] text-[var(--text-secondary)]'
          : 'bg-yellow-600 hover:bg-yellow-500 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
      </button>
    </div>
  );
}