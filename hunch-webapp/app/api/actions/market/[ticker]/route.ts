import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketByMint, fetchMarkets, fetchEventDetails, fetchEvents } from '@/app/lib/api';
import { requestOrder, USDC_MINT } from '@/app/lib/tradeApi';
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  BLOCKCHAIN_IDS,
} from '@solana/actions';

// CAIP-2 format for Solana (use mainnet for production, devnet for testing)
const blockchain = BLOCKCHAIN_IDS.mainnet; // Change to BLOCKCHAIN_IDS.devnet for devnet

// Set standardized headers for Blink Providers
const headers = {
  ...ACTIONS_CORS_HEADERS,
  'x-blockchain-ids': blockchain,
  'x-action-version': '2.4',
};

// OPTIONS endpoint is required for CORS preflight requests
// Your Blink won't render if you don't add this
export async function OPTIONS(request: NextRequest) {
  return new Response(null, { headers });
}

// GET endpoint - Returns action metadata
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { ticker: tickerParam } = await params;
    const ticker = decodeURIComponent(tickerParam);
    const side = searchParams.get('side'); // 'yes' or 'no', optional

    console.log(`[GET] Fetching market action for ticker: ${ticker}`);

    // Fetch market data from DFlow API
    // Try multiple sources: direct markets endpoint and events with nested markets
    let market: any = null;

    try {
      // First, try direct markets endpoint
      const markets = await fetchMarkets(200);
      console.log(`[GET] Fetched ${markets.length} markets from direct endpoint`);
      market = markets.find((m) => m.ticker === ticker);

      // If not found, try searching in events with nested markets
      if (!market) {
        console.log(`[GET] Market not found in direct endpoint, searching in events...`);
        const eventsResponse = await fetchEvents(200, { withNestedMarkets: true });
        console.log(`[GET] Fetched ${eventsResponse.events.length} events with nested markets`);

        // Search through all events' nested markets
        for (const event of eventsResponse.events) {
          if (event.markets && Array.isArray(event.markets)) {
            const foundMarket = event.markets.find((m: any) => m.ticker === ticker);
            if (foundMarket) {
              market = foundMarket;
              console.log(`[GET] Found market in event: ${event.ticker}`);
              break;
            }
          }
        }
      }
    } catch (fetchError: any) {
      console.error('[GET] Error fetching markets:', fetchError);
      // Return a more helpful error message
      const errorMessage = fetchError.message || 'Unknown error';
      console.error('[GET] Full error details:', {
        message: errorMessage,
        stack: fetchError.stack,
      });
      return NextResponse.json(
        {
          message: `Failed to fetch markets: ${errorMessage}`,
        },
        {
          status: 500,
          headers,
        }
      );
    }

    console.log(`[GET] Market found: ${market ? 'yes' : 'no'}`);

    if (!market) {
      // Return proper ActionError format for Solana Actions
      const errorResponse: ActionGetResponse = {
        type: 'action',
        icon: `${request.nextUrl.origin}/favicon.ico`,
        title: 'Hunch Prediction Markets',
        description: `Market "${ticker}" not found`,
        label: 'Market Not Found',
        disabled: true,
        error: {
          message: `Market with ticker "${ticker}" not found. Please check the ticker and try again.`,
        },
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 200, // Return 200 with disabled=true for non-fatal errors
        headers,
      });
    }

    // Check if market is active
    const isDisabled = market.status !== 'active';
    const error = isDisabled
      ? {
        message: `Market is not active. Current status: ${market.status || 'unknown'}`,
      }
      : undefined;

    // Get mint addresses
    const getMintAddress = (type: 'yes' | 'no'): string | undefined => {
      if (market.accounts && typeof market.accounts === 'object') {
        const usdcAccount = (market.accounts as any)[USDC_MINT];
        if (usdcAccount) {
          const mint = type === 'yes' ? usdcAccount.yesMint : usdcAccount.noMint;
          if (mint) return mint;
        }

        const accountKeys = Object.keys(market.accounts);
        for (const key of accountKeys) {
          const account = (market.accounts as any)[key];
          if (account && typeof account === 'object') {
            const mint = type === 'yes' ? account.yesMint : account.noMint;
            if (mint) return mint;
          }
        }
      }

      const mint = type === 'yes' ? market.yesMint : market.noMint;
      return mint;
    };

    const yesMint = getMintAddress('yes');
    const noMint = getMintAddress('no');

    if (!yesMint || !noMint) {
      return NextResponse.json(
        {
          message: 'Market mint addresses not available',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    // Try to get image from event, fallback to favicon
    let iconUrl = `${request.nextUrl.origin}/favicon.ico`;
    try {
      if (market.eventTicker) {
        const eventDetails = await fetchEventDetails(market.eventTicker);
        if (eventDetails && (eventDetails as any).imageUrl) {
          iconUrl = (eventDetails as any).imageUrl;
        }
      }
    } catch (error) {
      console.error('[GET] Error fetching event image:', error);
      // Fallback to favicon if event fetch fails
    }

    // If side is specified, return single action with amount input
    if (side === 'yes' || side === 'no') {
      const actionUrl = `${request.nextUrl.origin}/api/actions/market/${encodeURIComponent(ticker)}?side=${side}&amount={amount}`;
      const response: ActionGetResponse = {
        type: 'action',
        icon: iconUrl,
        title: 'Hunch Prediction Markets',
        description: `Place an order on "${market.title || market.ticker}"`,
        label: `Buy ${side.toUpperCase()}`,
        disabled: isDisabled,
        ...(error && { error }),
        links: {
          actions: [
            {
              type: 'transaction',
              label: `Buy ${side.toUpperCase()}`,
              href: actionUrl,
              parameters: [
                {
                  name: 'amount',
                  label: 'USDC Amount',
                  type: 'number',
                  required: true,
                  min: 0.000001,
                  pattern: '^[0-9]+(\\.[0-9]{1,6})?$',
                  patternDescription: 'Enter a valid USDC amount (minimum 0.000001)',
                },
              ],
            },
          ],
        },
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers,
      });
    }

    // Return multiple actions (YES and NO buttons) with amount input
    const yesActionUrl = `${request.nextUrl.origin}/api/actions/market/${encodeURIComponent(ticker)}?side=yes&amount={amount}`;
    const noActionUrl = `${request.nextUrl.origin}/api/actions/market/${encodeURIComponent(ticker)}?side=no&amount={amount}`;
    const response: ActionGetResponse = {
      type: 'action',
      icon: iconUrl,
      title: 'Hunch Prediction Markets',
      description: `Place an order on "${market.title || market.ticker}"`,
      label: 'Place Order',
      disabled: isDisabled,
      ...(error && { error }),
      links: {
        actions: [
          {
            type: 'transaction',
            label: 'Buy YES',
            href: yesActionUrl,
            parameters: [
              {
                name: 'amount',
                label: 'USDC Amount',
                type: 'number',
                required: true,
                min: 0.000001,
                pattern: '^[0-9]+(\\.[0-9]{1,6})?$',
                patternDescription: 'Enter a valid USDC amount (minimum 0.000001)',
              },
            ],
          },
          {
            type: 'transaction',
            label: 'Buy NO',
            href: noActionUrl,
            parameters: [
              {
                name: 'amount',
                label: 'USDC Amount',
                type: 'number',
                required: true,
                min: 0.000001,
                pattern: '^[0-9]+(\\.[0-9]{1,6})?$',
                patternDescription: 'Enter a valid USDC amount (minimum 0.000001)',
              },
            ],
          },
        ],
      },
    };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('Error in GET /api/actions/market:', error);
    return NextResponse.json(
      {
        message: error.message || 'Failed to fetch market action',
      },
      {
        status: 500,
        headers,
      }
    );
  }
}

// POST endpoint - Returns transaction for placing order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const requestBody: ActionPostRequest = await request.json();
    const { account } = requestBody;

    if (!account) {
      return NextResponse.json(
        {
          message: 'Account is required',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const { ticker: tickerParam } = await params;
    const ticker = decodeURIComponent(tickerParam);
    const side = searchParams.get('side');
    const amount = searchParams.get('amount');

    if (!side || (side !== 'yes' && side !== 'no')) {
      return NextResponse.json(
        {
          message: 'Side parameter is required and must be "yes" or "no"',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json(
        {
          message: 'Amount parameter is required and must be greater than 0',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    // Fetch market data - try multiple sources like GET endpoint
    let market: any = null;

    try {
      // First, try direct markets endpoint
      const markets = await fetchMarkets(200);
      market = markets.find((m) => m.ticker === ticker);

      // If not found, try searching in events with nested markets
      if (!market) {
        console.log(`[POST] Market not found in direct endpoint, searching in events...`);
        const eventsResponse = await fetchEvents(200, { withNestedMarkets: true });

        // Search through all events' nested markets
        for (const event of eventsResponse.events) {
          if (event.markets && Array.isArray(event.markets)) {
            const foundMarket = event.markets.find((m: any) => m.ticker === ticker);
            if (foundMarket) {
              market = foundMarket;
              console.log(`[POST] Found market in event: ${event.ticker}`);
              break;
            }
          }
        }
      }
    } catch (fetchError: any) {
      console.error('[POST] Error fetching markets:', fetchError);
      return NextResponse.json(
        {
          message: `Failed to fetch markets: ${fetchError.message || 'Unknown error'}`,
        },
        {
          status: 500,
          headers,
        }
      );
    }

    if (!market) {
      return NextResponse.json(
        {
          message: `Market with ticker "${ticker}" not found`,
        },
        {
          status: 404,
          headers,
        }
      );
    }

    if (market.status !== 'active') {
      return NextResponse.json(
        {
          message: `Market is not active. Current status: ${market.status || 'unknown'}`,
        },
        {
          status: 400,
          headers,
        }
      );
    }

    // Get mint addresses
    const getMintAddress = (type: 'yes' | 'no'): string | undefined => {
      if (market.accounts && typeof market.accounts === 'object') {
        const usdcAccount = (market.accounts as any)[USDC_MINT];
        if (usdcAccount) {
          const mint = type === 'yes' ? usdcAccount.yesMint : usdcAccount.noMint;
          if (mint) return mint;
        }

        const accountKeys = Object.keys(market.accounts);
        for (const key of accountKeys) {
          const account = (market.accounts as any)[key];
          if (account && typeof account === 'object') {
            const mint = type === 'yes' ? account.yesMint : account.noMint;
            if (mint) return mint;
          }
        }
      }

      const mint = type === 'yes' ? market.yesMint : market.noMint;
      return mint;
    };

    const outcomeMint = getMintAddress(side as 'yes' | 'no');

    if (!outcomeMint) {
      return NextResponse.json(
        {
          message: 'Market mint addresses not available',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    // Convert amount to smallest unit (USDC has 6 decimals)
    const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000);

    if (amountInSmallestUnit < 1) {
      return NextResponse.json(
        {
          message: 'Amount too small. Minimum is 0.000001 USDC',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    // Request order from DFlow Trade API
    const order = await requestOrder({
      userPublicKey: account,
      inputMint: USDC_MINT,
      outputMint: outcomeMint,
      amount: amountInSmallestUnit.toString(),
      slippageBps: 100, // 1% slippage
    });

    // Return transaction in Solana Actions format
    const response: ActionPostResponse = {
      type: 'transaction',
      transaction: order.openTransaction as any,
      message: `Order to buy ${side.toUpperCase()} tokens for ${amount} USDC on "${market.title || market.ticker}"`,
    };
    return Response.json(response, { status: 200, headers });
  } catch (error: any) {
    console.error('Error in POST /api/actions/market:', error);
    return NextResponse.json(
      {
        message: error.message || 'Failed to create order transaction',
      },
      {
        status: 500,
        headers,
      }
    );
  }
}

