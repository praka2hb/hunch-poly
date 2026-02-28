'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from './ThemeProvider';

interface SuggestedUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string;
  _count?: {
    trades: number;
    followers: number;
    following: number;
  };
}

export default function SuggestedProfiles() {
  const router = useRouter();
  const { currentUserId } = useAppData();
  const { theme } = useTheme();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingStates, setFollowingStates] = useState<Map<string, boolean>>(new Map());
  const [followLoading, setFollowLoading] = useState<Map<string, boolean>>(new Map());

  // Fetch suggested users and filter out already followed users
  useEffect(() => {
    const fetchSuggested = async () => {
      setLoading(true);
      try {
        const url = `/api/users/suggested?limit=10${currentUserId ? `&excludeUserId=${currentUserId}` : ''}`;
        const response = await fetch(url);
        if (response.ok) {
          const users = await response.json();

          // If user is logged in, filter out already followed users
          if (currentUserId) {
            try {
              const followingRes = await fetch(`/api/follow/following?userId=${currentUserId}`);
              if (followingRes.ok) {
                const following = await followingRes.json();
                const followingIds = new Set(following.map((f: any) => f.following.id));

                // Filter out users that are already being followed, then take top 3
                const notFollowingUsers = users
                  .filter((user: SuggestedUser) => !followingIds.has(user.id))
                  .slice(0, 3);

                setSuggestedUsers(notFollowingUsers);

                // Set follow states (should all be false since we filtered)
                const states = new Map<string, boolean>();
                notFollowingUsers.forEach((user: SuggestedUser) => {
                  states.set(user.id, false);
                });
                setFollowingStates(states);
              } else {
                // If follow check fails, just show first 3
                setSuggestedUsers(users.slice(0, 3));
              }
            } catch (error) {
              console.error('Error checking follow status:', error);
              // If follow check fails, just show first 3
              setSuggestedUsers(users.slice(0, 3));
            }
          } else {
            // Not logged in, just show first 3
            setSuggestedUsers(users.slice(0, 3));
          }
        }
      } catch (error) {
        console.error('Error fetching suggested users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggested();
  }, [currentUserId]);

  const handleFollowClick = async (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    if (!currentUserId || currentUserId === userId) return;

    const isFollowing = followingStates.get(userId) || false;
    setFollowLoading((prev) => new Map(prev).set(userId, true));

    try {
      if (isFollowing) {
        await fetch('/api/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerId: currentUserId,
            followingId: userId,
          }),
        });
        setFollowingStates((prev) => new Map(prev).set(userId, false));
      } else {
        await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerId: currentUserId,
            followingId: userId,
          }),
        });
        setFollowingStates((prev) => new Map(prev).set(userId, true));
      }
    } catch (error) {
      console.error('Error following/unfollowing:', error);
    } finally {
      setFollowLoading((prev) => {
        const newMap = new Map(prev);
        newMap.delete(userId);
        return newMap;
      });
    }
  };

  const handleUserClick = (user: SuggestedUser) => {
    const username = user.displayName || user.id;
    router.push(`/user/${encodeURIComponent(username)}`);
  };

  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] rounded-2xl p-4">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Suggested follows</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-hover)]" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-[var(--surface-hover)] rounded mb-2" />
                <div className="h-3 w-16 bg-[var(--surface-hover)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (suggestedUsers.length === 0) {
    return null;
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl p-4">
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Suggested follows</h3>
      <div className="space-y-3">
        {suggestedUsers.map((user) => {
          const displayName = user.displayName || `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`;
          const isFollowing = followingStates.get(user.id) || false;
          const isLoading = followLoading.get(user.id) || false;
          const tradeCount = user._count?.trades || 0;

          return (
            <div
              key={user.id}
              onClick={() => handleUserClick(user)}
              className="flex items-center py-2 px-2 hover:bg-[var(--surface-hover)]/40 rounded-lg cursor-pointer group transition-colors relative"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <img
                  src={user.avatarUrl || '/default.png'}
                  alt={displayName}
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--text-primary)] text-sm font-medium group-hover:text-yellow-400 transition-colors truncate">
                    {displayName}
                  </p>
                  <p className="text-[var(--text-tertiary)] text-xs">
                    {tradeCount} {tradeCount === 1 ? 'trade' : 'trades'}
                  </p>
                </div>
              </div>
              {currentUserId && currentUserId !== user.id && (
                <button
                  onClick={(e) => handleFollowClick(e, user.id)}
                  disabled={isLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    theme === 'dark'
                      ? 'bg-gray-100 hover:bg-gray-200 text-black border border-[var(--border-color)]'
                      : 'bg-black hover:bg-gray-800 text-white'
                  }`}
                >
                  {isLoading ? (
                    <span className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin inline-block ${
                      theme === 'dark' ? 'border-[var(--text-primary)]' : 'border-black'
                    }`} />
                  ) : isFollowing ? (
                    'Unfollow'
                  ) : (
                    'Follow'
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

