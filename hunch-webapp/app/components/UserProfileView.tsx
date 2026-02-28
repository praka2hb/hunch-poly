'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useSessionSigners } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import Link from 'next/link';
import UserTrades from './UserTrades';
import UserPositionsEnhanced from './UserPositionsEnhanced';
import { useTheme } from './ThemeProvider';
import FollowersFollowingModal from './FollowersFollowingModal';
import CopySettingsModal from './CopySettingsModal';
import { useAppData } from '../contexts/AppDataContext';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { USDC_MINT } from '../lib/tradeApi';

interface UserProfile {
    id: string;
    privyId: string;
    walletAddress: string;
    displayName: string | null;
    avatarUrl: string | null;
    followerCount: number;
    followingCount: number;
    createdAt: string;
}

interface UserProfileViewProps {
    userId: string;
}

export default function UserProfileView({ userId }: UserProfileViewProps) {
    const { ready, authenticated } = usePrivy();
    const { theme } = useTheme();
    const { currentUserId } = useAppData(); // Use context for current user
    const { removeSessionSigners } = useSessionSigners();
    const { wallets } = useWallets();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [checkingFollow, setCheckingFollow] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalType, setModalType] = useState<'followers' | 'following'>('followers');
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [hasCopySettings, setHasCopySettings] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
    const [solPrice, setSolPrice] = useState<number | null>(null);
    const [balancesLoading, setBalancesLoading] = useState(false);

    // Fetch the profile being viewed
    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/users/${userId}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        setError('User not found');
                    } else {
                        throw new Error('Failed to fetch user profile');
                    }
                    return;
                }

                const data = await response.json();
                setProfile(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load profile');
                console.error('Error fetching profile:', err);
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            fetchProfile();
        }
    }, [userId]);

    // Check if current user follows this profile
    useEffect(() => {
        const checkFollowStatus = async () => {
            if (!currentUserId || currentUserId === userId) {
                setCheckingFollow(false);
                return;
            }

            try {
                const response = await fetch(`/api/follow/following?userId=${currentUserId}`);
                if (response.ok) {
                    const following = await response.json();
                    setIsFollowing(following.some((f: any) => f.following.id === userId));
                }
            } catch (error) {
                console.error('Error checking follow status:', error);
            } finally {
                setCheckingFollow(false);
            }
        };

        if (currentUserId && profile) {
            checkFollowStatus();
        }
    }, [currentUserId, userId, profile]);

    // Check if current user has copy settings for this profile
    useEffect(() => {
        const checkCopySettings = async () => {
            if (!currentUserId || currentUserId === userId || !isFollowing) {
                setHasCopySettings(false);
                return;
            }

            try {
                const response = await fetch(`/api/copy-settings?followerId=${currentUserId}&leaderId=${userId}`);
                if (response.ok) {
                    const data = await response.json();
                    setHasCopySettings(!!data && data.enabled);
                }
            } catch (error) {
                console.error('Error checking copy settings:', error);
            }
        };

        checkCopySettings();
    }, [currentUserId, userId, isFollowing]);

    const handleFollow = async () => {
        if (!currentUserId || currentUserId === userId || followLoading) return;

        const wasFollowing = isFollowing;
        setIsFollowing(!wasFollowing);
        setFollowLoading(true);

        try {
            if (wasFollowing) {
                // Unfollowing - remove signer only if copy trading is enabled
                if (hasCopySettings && wallets[0]?.address) {
                    console.log('Copy trading is enabled, removing server as signer...');
                    console.log('Wallet address:', wallets[0].address);
                    try {
                        await removeSessionSigners({
                            address: wallets[0].address
                        });
                        console.log('✅ Server signer removed successfully');
                    } catch (signerError: any) {
                        console.error('⚠️ Failed to remove signer:', signerError);
                        console.error('Error details:', signerError.message);
                        // Continue with unfollow even if signer removal fails
                    }
                } else {
                    console.log('No copy trading enabled, skipping signer removal');
                }

                // Unfollow user (this also deletes copy settings in the backend)
                console.log('Proceeding with unfollow...');
                await fetch('/api/follow', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        followerId: currentUserId,
                        followingId: userId,
                    }),
                });
                setProfile(prev => prev ? { ...prev, followerCount: Math.max(0, prev.followerCount - 1) } : prev);
                setHasCopySettings(false); // Reset copy settings state
                console.log('✅ Unfollow completed');
            } else {
                await fetch('/api/follow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        followerId: currentUserId,
                        followingId: userId,
                    }),
                });
                setProfile(prev => prev ? { ...prev, followerCount: prev.followerCount + 1 } : prev);
            }
        } catch (error) {
            console.error('Error following/unfollowing:', error);
            setIsFollowing(wasFollowing);
        } finally {
            setFollowLoading(false);
        }
    };

    const displayName = profile?.displayName || (profile?.walletAddress ? `${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}` : 'Unknown');
    const isOwnProfile = currentUserId === userId;
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const formatCurrency = (value: number | null | undefined) => {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    };

    const combinedUsdBalance = (() => {
        const solUsd = solBalance !== null && solPrice !== null ? solBalance * solPrice : 0;
        const usdcUsd = usdcBalance ?? 0;
        return solUsd + usdcUsd;
    })();

    // Fetch SOL price periodically
    useEffect(() => {
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
        fetchSolPrice();
        const interval = setInterval(fetchSolPrice, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Fetch SOL + USDC balances for viewed wallet
    useEffect(() => {
        const fetchBalances = async () => {
            if (!profile?.walletAddress) return;
            setBalancesLoading(true);
            try {
                const publicKey = new PublicKey(profile.walletAddress);

                // SOL balance
                const lamports = await connection.getBalance(publicKey);
                setSolBalance(lamports / LAMPORTS_PER_SOL);

                // USDC balance
                try {
                    const usdcMint = new PublicKey(USDC_MINT);
                    const usdcTokenAddress = await getAssociatedTokenAddress(usdcMint, publicKey);
                    const usdcAccount = await getAccount(connection, usdcTokenAddress);
                    const usdcBal = Number(usdcAccount.amount) / 1_000_000; // USDC has 6 decimals
                    setUsdcBalance(usdcBal);
                } catch (usdcErr) {
                    console.log('No USDC account found, setting balance to 0');
                    setUsdcBalance(0);
                }
            } catch (err) {
                console.error('Error fetching balances:', err);
                setSolBalance(null);
                setUsdcBalance(null);
            } finally {
                setBalancesLoading(false);
            }
        };

        fetchBalances();
    }, [profile?.walletAddress, connection]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-[var(--text-secondary)] text-sm">Loading profile...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p className="text-[var(--text-secondary)] text-lg mb-2">{error}</p>
                <Link
                    href="/social"
                    className="inline-flex items-center gap-2 text-white hover:text-white text-sm mt-4"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Social
                </Link>
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="space-y-6">
            {/* Back Button */}
            <Link
                href="/social"
                className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm group"
            >
                <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Social
            </Link>

            {/* Main Profile Card - Matching /profile layout exactly */}
            <div className="bg-[var(--surface)]/50 backdrop-blur-sm rounded-2xl p-6">

                {/* User Info Section - Exactly like Profile */}
                <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
                    <div className="flex items-start gap-4">
                        {/* Minimal Avatar */}
                        <img
                            src={profile.avatarUrl || '/default.png'}
                            alt={displayName}
                            className="w-16 h-16 rounded-full border-2 border-white/30"
                        />

                        <div className="flex-1">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                                        {displayName}
                                    </h3>
                                    <p className="text-[var(--text-tertiary)] text-xs font-mono">
                                        {profile.walletAddress.slice(0, 8)}...{profile.walletAddress.slice(-6)}
                                    </p>
                                </div>

                                {/* Follow Button + Copy Trade Button */}
                                {!isOwnProfile && currentUserId && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleFollow}
                                            disabled={followLoading || checkingFollow}
                                            className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${isFollowing
                                                ? 'bg-[var(--surface-hover)] hover:bg-red-500/10 hover:text-red-400 text-[var(--text-secondary)] border border-[var(--border-color)]'
                                                : 'bg-[var(--text-primary)] hover:opacity-90 text-[var(--card-bg)] shadow-lg'
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {followLoading || checkingFollow ? (
                                                <span className="flex items-center gap-2">
                                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                </span>
                                            ) : isFollowing ? 'Unfollow' : 'Follow'}
                                        </button>

                                        {/* Copy Trade Button - Only shown when following */}
                                        {isFollowing && (
                                            <button
                                                onClick={() => setCopyModalOpen(true)}
                                                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 ${hasCopySettings
                                                    ? 'bg-[var(--text-primary)] text-[var(--card-bg)] shadow-lg'
                                                    : 'bg-[var(--surface-hover)] hover:bg-[var(--text-primary)]/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
                                                    }`}
                                                title={hasCopySettings ? 'Copy trading enabled' : 'Set up copy trading'}
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                                </svg>
                                                {hasCopySettings ? 'Copying' : 'Copy'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Followers/Following Counts - Clickable */}
                            <div className="flex items-center gap-8 mt-4">
                                <button
                                    onClick={() => {
                                        setModalType('followers');
                                        setModalOpen(true);
                                    }}
                                    className="flex flex-col hover:bg-[var(--surface-hover)] px-3 py-2 rounded-lg transition-all cursor-pointer group"
                                >
                                    <span className="text-xl font-bold text-[var(--text-primary)] group-hover:text-white transition-colors font-number">{profile.followerCount}</span>
                                    <span className="text-[var(--text-tertiary)] text-md group-hover:text-[var(--text-secondary)] transition-colors">Followers</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setModalType('following');
                                        setModalOpen(true);
                                    }}
                                    className="flex flex-col hover:bg-[var(--surface-hover)] px-3 py-2 rounded-lg transition-all cursor-pointer group"
                                >
                                    <span className="text-xl font-bold text-[var(--text-primary)] group-hover:text-white transition-colors font-number">{profile.followingCount}</span>
                                    <span className="text-[var(--text-tertiary)] text-md group-hover:text-[var(--text-secondary)] transition-colors">Following</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Flex Container: UserPositions (Left) and CreditCard (Right) */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* User Positions Section with Active/Previous Tabs - LEFT SIDE */}
                    <div className="flex-1 lg:pr-16">
                        {/* Use the canonical DB id from the loaded profile when available.
                            This avoids empty positions if the route param ever differs (e.g. walletAddress). */}
                        <UserPositionsEnhanced 
                            userId={profile?.id || userId}
                            walletAddress={profile?.walletAddress || null}
                            allowActions={isOwnProfile}
                        />
                    </div>

                    {/* Credit Card Style Stats - RIGHT SIDE */}
                    <div className="lg:w-96 flex-shrink-0 lg:-ml-16">
                        <div className={`relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden ${theme === 'light'
                            ? 'shadow-xl'
                            : 'shadow-2xl shadow-black/50'
                            }`}>
                            {/* Card Background with Gradient */}
                            <div className={`absolute inset-0 ${theme === 'light'
                                ? 'bg-gradient-to-br from-emerald-200 via-lime-300 to-green-200'
                                : 'bg-gradient-to-br from-emerald-900/40 via-lime-900/40 to-green-900/40'
                                }`}>
                                {/* Decorative circles */}
                                <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-2xl ${theme === 'light' ? 'bg-gray-200/40' : 'bg-white/10'
                                    }`} />
                                <div className={`absolute -bottom-20 -left-20 w-48 h-48 rounded-full blur-3xl ${theme === 'light' ? 'bg-teal-200/30' : 'bg-white/20'
                                    }`} />
                            </div>

                            {/* Card Content */}
                            <div className="relative h-full px-4 pb-4 pt-3 sm:px-7 sm:pb-7 sm:pt-4 flex flex-col justify-between font-number">
                                {/* Top Row - Username */}
                                <div className="flex items-start justify-end">
                                    <span className={`text-sm sm:text-lg font-bold tracking-wide ${theme === 'light' ? 'text-yellow-700' : 'text-white/90'
                                        }`}>
                                        {displayName}
                                    </span>
                                </div>

                                {/* Middle Row - Viewing Other User */}
                                <div className="flex-1 flex flex-col justify-center -mt-2">
                                    <p className={`text-sm sm:text-sm font-medium tracking-wider uppercase mb-1 ${theme === 'light' ? 'text-black/80' : 'text-white/60'
                                        }`}>Cash Balance (SOL + USDC)</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-number ${theme === 'light' ? 'text-slate-900' : 'text-white'
                                            }`}>
                                            {balancesLoading ? '…' : formatCurrency(combinedUsdBalance)}
                                        </span>
                                    </div>
                                </div>

                                {/* Bottom Row - Stats */}
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className={`text-[10px] sm:text-xs font-medium tracking-wider uppercase mb-0.5 ${theme === 'light' ? 'text-gray-700' : 'text-white/90'
                                            }`}>Total Bets</p>
                                        <span className={`font-semibold text-base sm:text-xl font-number ${theme === 'light' ? 'text-gray-700' : 'text-white'
                                            }`}>17</span>
                                    </div>

                                    <div className="text-right">
                                        <p className={`text-[10px] sm:text-xs font-medium tracking-wider uppercase mb-0.5 ${theme === 'light' ? 'text-gray-700' : 'text-white/60'
                                            }`}>P&L</p>
                                        <span className={`font-semibold text-base sm:text-lg font-number ${theme === 'light' ? 'text-gray-700' : 'text-white'
                                            }`}>
                                            -12.50%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Texture Overlay */}
                            <div
                                className="absolute inset-0 opacity-60 pointer-events-none mix-blend-overlay"
                                style={{
                                    backgroundImage: `url("/texture.jpeg")`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }}
                            />

                            {/* Shine Effect */}
                            <div className={`absolute inset-0 pointer-events-none ${theme === 'light'
                                ? 'bg-gradient-to-tr from-transparent via-white/30 to-white/50'
                                : 'bg-gradient-to-tr from-transparent via-white/5 to-white/10'
                                }`} />

                            {/* Light theme border */}
                            {theme === 'light' && (
                                <div className="absolute inset-0 rounded-2xl border border-gray-200/50 pointer-events-none" />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Followers/Following Modal */}
            <FollowersFollowingModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                userId={userId}
                type={modalType}
                currentUserId={currentUserId}
            />

            {/* Copy Settings Modal */}
            {profile && (
                <CopySettingsModal
                    isOpen={copyModalOpen}
                    onClose={() => setCopyModalOpen(false)}
                    followerId={currentUserId || ''}
                    leaderId={userId}
                    leaderName={displayName}
                    onSave={() => {
                        // Refresh copy settings status
                        fetch(`/api/copy-settings?followerId=${currentUserId}&leaderId=${userId}`)
                            .then(res => res.json())
                            .then(data => setHasCopySettings(!!data && data.enabled))
                            .catch(console.error);
                    }}
                />
            )}
        </div>
    );
}
