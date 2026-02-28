'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getUserPositions, createPost, UserPosition, CreatePostPayload } from '../lib/api';

interface PostComposerModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onPostSuccess?: () => void;
}

function PnlBadge({ pnlPercent, totalPnl }: { pnlPercent: number | null; totalPnl: number | null }) {
  if (pnlPercent == null && totalPnl == null) return null;
  const pct = pnlPercent ?? 0;
  const isPositive = pct >= 0;
  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        isPositive ? 'text-green-400' : 'text-red-400'
      }`}
    >
      {isPositive ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function PositionRow({
  pos,
  onSelect,
}: {
  pos: UserPosition;
  onSelect: (pos: UserPosition) => void;
}) {
  const pnl = pos.isClosed ? pos.realizedPnl : (pos.totalPnl ?? pos.realizedPnl);
  const isPositive = (pnl ?? 0) >= 0;

  return (
    <button
      onClick={() => onSelect(pos)}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--input-bg)] transition-colors text-left"
    >
      {/* Market image */}
      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--border-color)]">
        {pos.imageUrl ? (
          <img src={pos.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs font-bold text-white/60"
            style={{ background: pos.colorCode ?? 'var(--surface-hover)' }}
          >
            {pos.side === 'yes' ? 'Y' : 'N'}
          </div>
        )}
      </div>

      {/* Market info */}
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text-primary)] text-xs font-medium truncate leading-tight">
          {pos.marketTitle || pos.marketTicker}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[var(--text-tertiary)] text-xs">
            Entry {(pos.avgEntryPrice * 100).toFixed(1)}¢
          </span>
          {!pos.isClosed && pos.currentPrice != null && (
            <span className="text-[var(--text-tertiary)] text-xs">
              · Now {(pos.currentPrice * 100).toFixed(1)}¢
            </span>
          )}
        </div>
      </div>

      {/* Right: side + PnL */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span
          className={`px-1.5 py-0.5 rounded-md text-xs font-semibold ${
            pos.side === 'yes' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}
        >
          {pos.side.toUpperCase()}
        </span>
        {pnl != null && (
          <span className={`text-xs font-medium tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}${Math.abs(pnl).toFixed(2)}
          </span>
        )}
      </div>
    </button>
  );
}

function SelectedPositionCard({
  pos,
  onRemove,
}: {
  pos: UserPosition;
  onRemove: () => void;
}) {
  const pnl = pos.isClosed ? pos.realizedPnl : (pos.totalPnl ?? pos.realizedPnl);
  const isPositive = (pnl ?? 0) >= 0;

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border-color)]">
      {/* Image */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--border-color)]">
        {pos.imageUrl ? (
          <img src={pos.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs font-bold text-white/60"
            style={{ background: pos.colorCode ?? 'var(--surface-hover)' }}
          >
            {pos.side === 'yes' ? 'Y' : 'N'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`px-1.5 py-0.5 rounded-md text-xs font-semibold ${
              pos.side === 'yes' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            {pos.side.toUpperCase()}
          </span>
          {pos.isClosed && (
            <span className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-[var(--border-color)] text-[var(--text-tertiary)]">
              Closed
            </span>
          )}
          <PnlBadge pnlPercent={pos.pnlPercent} totalPnl={pnl} />
        </div>

        <p className="text-[var(--text-primary)] text-sm font-medium truncate leading-tight">
          {pos.marketTitle || pos.marketTicker}
        </p>

        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-[var(--text-tertiary)] text-xs">
            Entry <span className="text-[var(--text-secondary)]">{(pos.avgEntryPrice * 100).toFixed(1)}¢</span>
          </span>
          {!pos.isClosed && pos.currentPrice != null && (
            <span className="text-[var(--text-tertiary)] text-xs">
              Now <span className="text-[var(--text-secondary)]">{(pos.currentPrice * 100).toFixed(1)}¢</span>
            </span>
          )}
          <span className="text-[var(--text-tertiary)] text-xs">
            Invested <span className="text-[var(--text-secondary)]">${pos.enteredAmount.toFixed(2)}</span>
          </span>
          {pnl != null && (
            <span className={`text-xs font-semibold tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              PnL {isPositive ? '+' : ''}${pnl.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
        aria-label="Remove position"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function PostComposerModal({
  visible,
  onClose,
  userId,
  onPostSuccess,
}: PostComposerModalProps) {
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'position_share'>('text');
  const [activePositions, setActivePositions] = useState<UserPosition[]>([]);
  const [previousPositions, setPreviousPositions] = useState<UserPosition[]>([]);
  const [pickerTab, setPickerTab] = useState<'active' | 'previous'>('active');
  const [selectedPosition, setSelectedPosition] = useState<UserPosition | null>(null);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setSelectedPosition(null);
    setPostType('text');
    setError(null);

    setLoadingPositions(true);
    getUserPositions(userId)
      .then(({ positions, previousPositions: prev }) => {
        setActivePositions(positions);
        setPreviousPositions(prev);
        // Default to the tab that has positions
        if (positions.length === 0 && prev.length > 0) setPickerTab('previous');
        else setPickerTab('active');
      })
      .catch(() => {
        setActivePositions([]);
        setPreviousPositions([]);
      })
      .finally(() => setLoadingPositions(false));

    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [visible, userId]);

  const handleSubmit = async () => {
    if (!content.trim() && postType === 'text') {
      setError('Write something to post');
      return;
    }
    if (postType === 'position_share' && !selectedPosition) {
      setError('Select a position to share');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload: CreatePostPayload = {
        content: content.trim() || undefined,
        postType,
        ...(postType === 'position_share' && selectedPosition
          ? {
              marketTicker: selectedPosition.marketTicker,
              side: selectedPosition.side,
              positionSize: selectedPosition.netSize,
              entryPrice: selectedPosition.avgEntryPrice,
            }
          : {}),
      };
      await createPost(payload);
      onPostSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to post. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPosition = (pos: UserPosition) => {
    setSelectedPosition(pos);
    setPostType('position_share');
  };

  const handleRemovePosition = () => {
    setSelectedPosition(null);
    setPostType('text');
  };

  const charLimit = 500;
  const charsLeft = charLimit - content.length;
  const pickerPositions = pickerTab === 'active' ? activePositions : previousPositions;
  const hasAny = activePositions.length > 0 || previousPositions.length > 0;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-auto md:left-1/2 md:-translate-x-1/2 md:w-[520px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--border-color)] flex-shrink-0">
              <h2 className="text-[var(--text-primary)] text-base font-semibold">New Post</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Text Input */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, charLimit))}
                placeholder="What's your take?"
                rows={3}
                className="w-full bg-[var(--surface-hover)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm rounded-xl px-4 py-3 resize-none outline-none focus:ring-1 focus:ring-yellow-400/50 transition"
              />
              <div className="flex justify-end -mt-2">
                <span className={`text-xs ${charsLeft < 50 ? 'text-yellow-400' : 'text-[var(--text-tertiary)]'}`}>
                  {charsLeft}
                </span>
              </div>

              {/* Selected Position Card */}
              {selectedPosition && (
                <SelectedPositionCard pos={selectedPosition} onRemove={handleRemovePosition} />
              )}

              {/* Position Picker */}
              {!selectedPosition && (
                <>
                  {loadingPositions ? (
                    <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-xs py-1">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading positions...
                    </div>
                  ) : hasAny ? (
                    <div>
                      {/* Tab bar */}
                      <div className="flex items-center gap-1 mb-3">
                        <p className="text-[var(--text-tertiary)] text-xs font-medium mr-2">Attach position</p>
                        <div className="flex gap-1 bg-[var(--surface-hover)] rounded-lg p-0.5">
                          <button
                            onClick={() => setPickerTab('active')}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              pickerTab === 'active'
                                ? 'bg-yellow-500 text-black'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Active {activePositions.length > 0 && `(${activePositions.length})`}
                          </button>
                          <button
                            onClick={() => setPickerTab('previous')}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              pickerTab === 'previous'
                                ? 'bg-yellow-500 text-black'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Previous {previousPositions.length > 0 && `(${previousPositions.length})`}
                          </button>
                        </div>
                      </div>

                      {pickerPositions.length > 0 ? (
                        <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                          {pickerPositions.map((pos) => (
                            <PositionRow
                              key={`${pos.marketTicker}-${pos.side}`}
                              pos={pos}
                              onSelect={handleSelectPosition}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[var(--text-tertiary)] text-xs text-center py-4">
                          No {pickerTab} positions
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              {/* Error */}
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-3 flex items-center justify-end gap-3 border-t border-[var(--border-color)] flex-shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!content.trim() && !selectedPosition)}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-yellow-500 hover:bg-yellow-400 text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                Post
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
