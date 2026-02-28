'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CopySettingsModal from './CopySettingsModal';

interface User {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
}

interface FollowersFollowingModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    type: 'followers' | 'following';
    currentUserId: string | null;
}

export default function FollowersFollowingModal({
    isOpen,
    onClose,
    userId,
    type,
    currentUserId,
}: FollowersFollowingModalProps) {
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
    const [followLoadingMap, setFollowLoadingMap] = useState<Record<string, boolean>>({});
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [selectedCopyUser, setSelectedCopyUser] = useState<User | null>(null);
    const [copySettingsMap, setCopySettingsMap] = useState<Record<string, boolean>>({});

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
            if (currentUserId) {
                fetchFollowingStatus();
                // Fetch copy settings for users if viewing "following" list
                if (type === 'following' && currentUserId === userId) {
                    fetchCopySettings();
                }
            }
        }
    }, [isOpen, userId, type, currentUserId]);

    const fetchCopySettings = async () => {
        if (!currentUserId) return;
        try {
            const response = await fetch(`/api/copy-settings?followerId=${currentUserId}`);
            if (response.ok) {
                const settings = await response.json();
                const map: Record<string, boolean> = {};
                settings.forEach((s: any) => {
                    if (s.enabled) map[s.leaderId] = true;
                });
                setCopySettingsMap(map);
            }
        } catch (error) {
            console.error('Error fetching copy settings:', error);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const endpoint = type === 'followers'
                ? `/api/follow/followers?userId=${userId}`
                : `/api/follow/following?userId=${userId}`;

            const response = await fetch(endpoint);
            if (response.ok) {
                const data = await response.json();
                // Extract user objects from the response
                const userList = data.map((item: any) =>
                    type === 'followers' ? item.follower : item.following
                );
                setUsers(userList);
            }
        } catch (error) {
            console.error(`Error fetching ${type}:`, error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFollowingStatus = async () => {
        if (!currentUserId) return;

        try {
            const response = await fetch(`/api/follow/following?userId=${currentUserId}`);
            if (response.ok) {
                const following = await response.json();
                const map: Record<string, boolean> = {};
                following.forEach((item: any) => {
                    map[item.following.id] = true;
                });
                setFollowingMap(map);
            }
        } catch (error) {
            console.error('Error fetching following status:', error);
        }
    };

    const handleFollow = async (targetUserId: string) => {
        if (!currentUserId || currentUserId === targetUserId) return;

        const isFollowing = followingMap[targetUserId];

        // Optimistic update
        setFollowingMap(prev => ({ ...prev, [targetUserId]: !isFollowing }));
        setFollowLoadingMap(prev => ({ ...prev, [targetUserId]: true }));

        try {
            if (isFollowing) {
                await fetch('/api/follow', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        followerId: currentUserId,
                        followingId: targetUserId,
                    }),
                });
            } else {
                await fetch('/api/follow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        followerId: currentUserId,
                        followingId: targetUserId,
                    }),
                });
            }
        } catch (error) {
            console.error('Error following/unfollowing:', error);
            // Rollback on error
            setFollowingMap(prev => ({ ...prev, [targetUserId]: isFollowing }));
        } finally {
            setFollowLoadingMap(prev => ({ ...prev, [targetUserId]: false }));
        }
    };

    const handleUserClick = (user: User) => {
        // Use displayName (username) if available, otherwise fall back to userId
        const username = user.displayName || user.id;
        router.push(`/user/${encodeURIComponent(username)}`);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100vh-2rem)] my-auto flex flex-col border border-[var(--border-color)]">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)]">
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">
                            {type === 'followers' ? 'Followers' : 'Following'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : users.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-[var(--text-secondary)]">
                                    No {type === 'followers' ? 'followers' : 'following'} yet
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {users.map((user) => {
                                    const displayName = user.displayName || `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
                                    const isFollowing = followingMap[user.id] || false;
                                    const isFollowLoading = followLoadingMap[user.id] || false;
                                    const isOwnProfile = currentUserId === user.id;

                                    return (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-hover)]/50 hover:bg-[var(--surface-hover)] transition-all border border-[var(--border-color)] group"
                                        >
                                            <div
                                                onClick={() => handleUserClick(user)}
                                                className="flex items-center gap-3 flex-1 cursor-pointer"
                                            >
                                                <img
                                                    src={user.avatarUrl || '/default.png'}
                                                    alt={displayName}
                                                    className="w-12 h-12 rounded-full border-2 border-yellow-500/30 transition-transform group-hover:scale-105"
                                                />
                                                <div>
                                                    <p className="text-[var(--text-primary)] font-semibold text-sm group-hover:text-yellow-400 transition-colors">
                                                        {displayName}
                                                    </p>
                                                    <p className="text-[var(--text-tertiary)] text-xs font-mono">
                                                        {user.walletAddress.slice(0, 8)}...
                                                    </p>
                                                </div>
                                            </div>

                                            {!isOwnProfile && currentUserId && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleFollow(user.id);
                                                    }}
                                                    disabled={isFollowLoading}
                                                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${isFollowing
                                                        ? 'bg-[var(--surface-hover)] hover:bg-red-500/10 hover:text-red-400 text-[var(--text-secondary)] border border-[var(--border-color)]'
                                                        : 'bg-gradient-to-r from-yellow-600 to-teal-500 hover:from-yellow-500 hover:to-teal-400 text-white shadow-lg shadow-yellow-500/25'
                                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                                >
                                                    {isFollowLoading ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        </span>
                                                    ) : isFollowing ? 'Unfollow' : 'Follow'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

