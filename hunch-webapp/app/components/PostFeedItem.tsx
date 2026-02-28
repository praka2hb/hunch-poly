'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Post } from '../lib/api';

interface PostFeedItemProps {
  post: Post;
  currentUserId?: string | null;
  onDelete?: (postId: string) => void;
}

export default function PostFeedItem({ post, currentUserId, onDelete }: PostFeedItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const user = post.user;
  const displayName = user
    ? user.displayName || `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`
    : 'Unknown';

  const isOwner = currentUserId && user && currentUserId === user.id;

  const handleUserClick = () => {
    if (!user) return;
    const slug = user.displayName || user.id;
    router.push(`/user/${encodeURIComponent(slug)}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this post?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      if (res.ok) onDelete?.(post.id);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-4 hover:border-[var(--border-color-hover)] transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <button
          onClick={handleUserClick}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity text-left"
        >
          <img
            src={user?.avatarUrl || '/default.png'}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
          <div>
            <p className="text-[var(--text-primary)] text-sm font-semibold leading-tight">
              {displayName}
            </p>
            <p className="text-[var(--text-tertiary)] text-xs">{timeAgo(post.createdAt)}</p>
          </div>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2 py-0.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-tertiary)] text-xs">
            Post
          </span>
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
              aria-label="Delete post"
            >
              {deleting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-[var(--text-primary)] text-sm leading-relaxed mb-3 whitespace-pre-wrap break-words">
          {post.content}
        </p>
      )}

      {/* Position Attachment */}
      {post.postType === 'position_share' && post.marketTicker && (
        <div className="mt-2 p-3 rounded-lg bg-[var(--surface-hover)] border border-[var(--border-color)]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide">
              Position
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${post.side === 'yes'
                  ? 'bg-green-500/15 text-green-400'
                  : 'bg-red-500/15 text-red-400'
                }`}
            >
              {post.side?.toUpperCase()}
            </span>
          </div>

          <p className="text-[var(--text-primary)] text-sm font-medium leading-snug">
            {post.marketDetails?.title || post.marketTicker}
          </p>

          {(post.positionSize != null || post.entryPrice != null) && (
            <div className="flex items-center gap-4 mt-2">
              {post.positionSize != null && (
                <div>
                  <span className="text-[var(--text-tertiary)] text-xs">Size</span>
                  <p className="text-[var(--text-secondary)] text-xs font-medium">
                    {post.positionSize.toFixed(2)}
                  </p>
                </div>
              )}
              {post.entryPrice != null && (
                <div>
                  <span className="text-[var(--text-tertiary)] text-xs">Avg Entry</span>
                  <p className="text-[var(--text-secondary)] text-xs font-medium">
                    {(post.entryPrice * 100).toFixed(1)}¢
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
