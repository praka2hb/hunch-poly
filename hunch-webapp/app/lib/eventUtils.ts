const CLOSED_MARKET_STATUSES = new Set(['finalized', 'resolved', 'closed']);

const toTimestampMs = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const isMarketActive = (market: { status?: string; closeTime?: unknown; expirationTime?: unknown }) => {
  const status = (market.status || '').toLowerCase();
  if (status && CLOSED_MARKET_STATUSES.has(status)) return false;

  const nowMs = Date.now();
  const closeMs = toTimestampMs(market.closeTime ?? market.expirationTime);
  if (closeMs && closeMs <= nowMs) return false;

  return true;
};

export const isEventActive = (event: {
  closeTime?: unknown;
  expirationTime?: unknown;
  markets?: Array<{ status?: string; closeTime?: unknown; expirationTime?: unknown }>;
}) => {
  const nowMs = Date.now();
  const eventCloseMs = toTimestampMs(event.closeTime ?? event.expirationTime);
  if (eventCloseMs && eventCloseMs <= nowMs) return false;

  if (Array.isArray(event.markets) && event.markets.length > 0) {
    return event.markets.some(isMarketActive);
  }

  return true;
};
