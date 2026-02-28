'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useAppData } from '../contexts/AppDataContext';
import SignalFeedItem from './SignalFeedItem';
import PostFeedItem from './PostFeedItem';
import PostComposerModal from './PostComposerModal';
import { getPostsFeed, Post } from '../lib/api';

// Feed item type from API
interface FeedItemResponse {
  id: string;
  type: 'TRADE_MILESTONE' | 'POSITION_CLOSED' | 'NEWS';
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  } | null;
  marketTicker: string;
  eventTicker: string | null;
  side: 'yes' | 'no' | null;
  milestoneType: string | null;
  milestoneValue: number | null;
  finalPnL: number | null;
  evidence: {
    id: string;
    headline: string | null;
    explanation: string | null;
    classification: string;
    highlightScore: number;
    sourceUrls: string[];
    sourceTitles: string[];
  } | null;
  createdAt: string;
  score: number;
}

type MixedFeedEntry =
  | { kind: 'signal'; data: FeedItemResponse }
  | { kind: 'post'; data: Post };

interface SearchResult {
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

// User Search Result Item Component
function UserSearchResultItem({
  user,
  currentUserId,
  onFollowChange,
}: {
  user: SearchResult;
  currentUserId: string | null;
  onFollowChange: () => void;
}) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    const checkFollowing = async () => {
      if (!currentUserId) return;
      try {
        const followingRes = await fetch(`/api/follow/following?userId=${currentUserId}`);
        if (followingRes.ok) {
          const following = await followingRes.json();
          setIsFollowing(following.some((f: any) => f.following.id === user.id));
        }
      } catch (error) {
        console.error('Error checking follow status:', error);
      }
    };
    checkFollowing();
  }, [currentUserId, user.id]);

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId || currentUserId === user.id || followLoading) return;

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await fetch('/api/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId: currentUserId, followingId: user.id }),
        });
        setIsFollowing(false);
      } else {
        await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId: currentUserId, followingId: user.id }),
        });
        setIsFollowing(true);
      }
      onFollowChange();
    } catch (error) {
      console.error('Error following/unfollowing:', error);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleCardClick = () => {
    const username = user.displayName || user.id;
    router.push(`/user/${encodeURIComponent(username)}`);
  };

  const displayName = user.displayName || `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`;

  return (
    <div
      onClick={handleCardClick}
      className="flex items-center justify-between py-2.5 px-2 hover:bg-[var(--surface-hover)]/40 rounded-lg cursor-pointer group transition-colors"
    >
      <div className="flex items-center gap-3">
        <img
          src={user.avatarUrl || '/default.png'}
          alt={displayName}
          className="w-9 h-9 rounded-full"
        />
        <span className="text-[var(--text-primary)] text-sm font-medium group-hover:text-yellow-400 transition-colors">
          {displayName}
        </span>
      </div>
      <button
        onClick={handleFollowClick}
        disabled={followLoading || !currentUserId || currentUserId === user.id}
        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${isFollowing
          ? 'bg-[var(--surface-hover)] hover:bg-red-500/10 hover:text-red-400 text-[var(--text-secondary)]'
          : 'bg-yellow-600 hover:bg-yellow-500 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {followLoading ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
        ) : isFollowing ? 'Unfollow' : 'Follow'}
      </button>
    </div>
  );
}

type FeedTab = 'for-you' | 'following';

export default function SocialFeed() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { currentUserId } = useAppData();

  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  const [feedItems, setFeedItems] = useState<MixedFeedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load feed when tab changes
  useEffect(() => {
    loadFeed();
  }, [activeTab, currentUserId, authenticated]);

  const loadFeed = async (cursor?: string) => {
    if (!cursor) {
      setLoading(true);
      setFeedItems([]);
    }
    setError(null);

    try {
      let signalUrl: string;

      if (activeTab === 'following' && currentUserId) {
        signalUrl = `/api/feed/following?userId=${currentUserId}&limit=20`;
      } else {
        signalUrl = `/api/feed/for-you?limit=20`;
        if (currentUserId) {
          signalUrl += `&excludeUserId=${currentUserId}`;
        }
      }

      if (cursor) {
        signalUrl += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const postsMode = activeTab === 'following' ? 'following' : 'global';

      const [signalResponse, postsData] = await Promise.all([
        fetch(signalUrl),
        cursor
          ? Promise.resolve([] as Post[])
          : getPostsFeed({
              userId: currentUserId ?? undefined,
              mode: postsMode,
              limit: 20,
              offset: 0,
            }).catch(() => [] as Post[]),
      ]);

      if (!signalResponse.ok) {
        throw new Error('Failed to load feed');
      }

      const signalData = await signalResponse.json();
      const signalItems: FeedItemResponse[] = signalData.items ?? [];

      // Build mixed entries and sort by createdAt DESC
      const newEntries: MixedFeedEntry[] = [
        ...signalItems.map((item): MixedFeedEntry => ({ kind: 'signal', data: item })),
        ...postsData.map((post): MixedFeedEntry => ({ kind: 'post', data: post })),
      ].sort(
        (a, b) =>
          new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime()
      );

      if (cursor) {
        setFeedItems((prev) => [...prev, ...newEntries]);
      } else {
        setFeedItems(newEntries);
      }
      setNextCursor(signalData.nextCursor);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed');
      console.error('Error loading feed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search function
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !authenticated || !currentUserId) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}&type=displayName`);
      if (response.ok) {
        const users = await response.json();
        const filtered = users.filter((u: SearchResult) => u.id !== currentUserId);
        setSearchResults(filtered);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [currentUserId, authenticated]);

  // Handle search input change with debounce
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Load more when scrolling
  const handleLoadMore = () => {
    if (nextCursor && !loading) {
      loadFeed(nextCursor);
    }
  };

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[var(--text-secondary)] text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center justify-center gap-1 bg-[var(--surface-hover)] rounded-full p-1 max-w-xs mx-auto">
        <button
          onClick={() => setActiveTab('for-you')}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-full transition-all ${activeTab === 'for-you'
              ? 'bg-yellow-400 text-black'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
        >
          For You
        </button>
        <button
          onClick={() => setActiveTab('following')}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-full transition-all ${activeTab === 'following'
              ? 'bg-yellow-400 text-black'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
        >
          Following
        </button>
      </div>

      {/* Search Bar - Desktop only, authenticated only */}
      {authenticated && (
        <div className="hidden md:flex justify-center relative z-50">
          <div className={`relative transition-all duration-300 ease-out ${isSearchFocused || searchQuery ? 'w-96' : 'w-72'}`}>
            {/* Search Icon */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              {searching ? (
                <svg className="w-4 h-4 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search friends..."
              className={`w-full pr-9 pl-10 py-2.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm transition-all duration-300 outline-none ${isSearchFocused ? 'bg-[var(--card-bg)]' : 'hover:bg-[var(--card-bg)]'}`}
            />

            {/* Clear button */}
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {(searchResults.length > 0 || (searchQuery.trim() && !searching && searchResults.length === 0)) && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-96 bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border-color)] max-h-72 overflow-y-auto">
              {searchResults.length > 0 ? (
                <div className="p-2">
                  {searchResults.map((result) => (
                    <UserSearchResultItem
                      key={result.id}
                      user={result}
                      currentUserId={currentUserId}
                      onFollowChange={() => {
                        performSearch(searchQuery);
                        loadFeed();
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[var(--text-tertiary)] text-sm">No users found</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header with Refresh + Compose */}
      <div className="flex items-center justify-between">
        {authenticated && currentUserId ? (
          <button
            onClick={() => setComposerVisible(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg transition-all duration-200 text-xs font-semibold"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Post
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={() => loadFeed()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-hover)] hover:bg-[var(--input-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-xs font-medium"
        >
          {loading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Post Composer Modal */}
      {authenticated && currentUserId && (
        <PostComposerModal
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          userId={currentUserId}
          onPostSuccess={() => {
            setComposerVisible(false);
            loadFeed();
          }}
        />
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Feed Content */}
      {loading && feedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[var(--text-secondary)] text-sm">Loading feed...</p>
        </div>
      ) : feedItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-[var(--text-secondary)] text-lg mb-2">
            {activeTab === 'following' ? 'No activity from people you follow' : 'No signals yet'}
          </p>
          <p className="text-[var(--text-tertiary)] text-sm">
            {activeTab === 'following'
              ? 'Follow traders to see their milestones here'
              : 'When traders hit milestones, they\'ll appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {feedItems.map((entry) =>
              entry.kind === 'post' ? (
                <PostFeedItem
                  key={`post-${entry.data.id}`}
                  post={entry.data}
                  currentUserId={currentUserId}
                  onDelete={(postId) =>
                    setFeedItems((prev) =>
                      prev.filter((e) => !(e.kind === 'post' && e.data.id === postId))
                    )
                  }
                />
              ) : (
                <SignalFeedItem key={`signal-${entry.data.id}`} item={entry.data} />
              )
            )}
          </AnimatePresence>

          {/* Load More Button */}
          {nextCursor && (
            <div className="flex justify-center py-4">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 bg-[var(--surface-hover)] hover:bg-[var(--card-bg)] text-[var(--text-secondary)] rounded-full text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Floating Search */}
      {authenticated && (
        <motion.div
          className="md:hidden fixed bottom-28 right-4 z-50 pointer-events-auto"
          animate={{
            width: isMobileSearchOpen ? '80vw' : '56px',
            maxWidth: isMobileSearchOpen ? 320 : 56,
            paddingLeft: isMobileSearchOpen ? 16 : 0,
            paddingRight: isMobileSearchOpen ? 16 : 0,
          }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
        >
          <div className="flex items-center gap-2 w-full h-14 px-2 border border-[var(--border-color)] rounded-full shadow-2xl bg-[var(--surface)]/90 backdrop-blur-sm origin-right">
            <button
              onClick={() => setIsMobileSearchOpen((prev) => !prev)}
              aria-label="Toggle search"
              className="flex items-center justify-center w-10 h-10 rounded-full text-[var(--text-primary)] hover:text-yellow-400 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            <motion.input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search friends..."
              className="flex-1 min-w-0 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm outline-none"
              animate={{
                opacity: isMobileSearchOpen ? 1 : 0,
                x: isMobileSearchOpen ? 0 : 6,
                width: isMobileSearchOpen ? '100%' : '0%',
              }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
              style={{ pointerEvents: isMobileSearchOpen ? 'auto' : 'none' }}
            />

            <AnimatePresence mode="popLayout">
              {isMobileSearchOpen && searchQuery && (
                <motion.button
                  key="clear"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Clear search"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>

            {isMobileSearchOpen && (
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close search"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
