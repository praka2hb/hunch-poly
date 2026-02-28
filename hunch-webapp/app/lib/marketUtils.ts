/**
 * Parse market ticker to extract date information
 * Example: KXBTCMAX150-25-26APR30-149999.99 -> APR 30, 2026
 */
export function parseMarketTicker(ticker: string): {
  date?: string;
  formattedDate?: string;
  year?: string;
  month?: string;
  day?: string;
} {
  try {
    // Pattern: KXBTCMAX150-25-26APR30-149999.99
    // Extract date part (e.g., "26APR30" or "APR30")
    const dateMatch = ticker.match(/(\d{2})?([A-Z]{3})(\d{2})/);
    
    if (!dateMatch) {
      return {};
    }

    const [, yearPrefix, monthAbbr, day] = dateMatch;
    
    // Map month abbreviations to full names
    const monthMap: { [key: string]: string } = {
      JAN: 'January',
      FEB: 'February',
      MAR: 'March',
      APR: 'April',
      MAY: 'May',
      JUN: 'June',
      JUL: 'July',
      AUG: 'August',
      SEP: 'September',
      OCT: 'October',
      NOV: 'November',
      DEC: 'December',
    };

    const month = monthMap[monthAbbr] || monthAbbr;
    
    // Determine year (if year prefix exists, use it; otherwise assume current year + 1)
    let year = '';
    if (yearPrefix) {
      // If year prefix is like "25" or "26", it's likely 2025 or 2026
      year = `20${yearPrefix}`;
    } else {
      // Default to next year if no year prefix
      const currentYear = new Date().getFullYear();
      year = (currentYear + 1).toString();
    }

    const formattedDate = `${month} ${day}, ${year}`;
    const date = `${year}-${monthAbbr}-${day.padStart(2, '0')}`;

    return {
      date,
      formattedDate,
      year,
      month,
      day,
    };
  } catch (error) {
    console.error('Error parsing ticker:', error);
    return {};
  }
}

/**
 * Format market title with date information
 */
export function formatMarketTitle(title: string, ticker: string): string {
  const dateInfo = parseMarketTicker(ticker);
  if (dateInfo.formattedDate) {
    return `${title} (by ${dateInfo.formattedDate})`;
  }
  return title;
}

