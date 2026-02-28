import { NextRequest, NextResponse } from 'next/server';

import { fetchEventDetailsServer } from '@/app/lib/dflowServer';
import { runPipelineForEvent, PipelineEventResult } from '@/app/lib/exaPipeline';
import { GET as getTopEventsByCategory } from '@/app/api/events/top-by-category/route';
import { prisma } from '@/app/lib/db';

const DEFAULT_LIMIT = 100;
const DEFAULT_PER_CATEGORY = 3;
const DEFAULT_CONCURRENCY = 3;

function getNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  let active = 0;

  return new Promise((resolve) => {
    const next = () => {
      if (index >= items.length && active === 0) {
        resolve(results);
        return;
      }

      while (active < limit && index < items.length) {
        const currentIndex = index++;
        active += 1;
        handler(items[currentIndex], currentIndex)
          .then((result) => {
            results[currentIndex] = result;
          })
          .catch((error) => {
            results[currentIndex] = error as R;
          })
          .finally(() => {
            active -= 1;
            next();
          });
      }
    };

    next();
  });
}

async function fetchTopEvents(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const url = new URL('/api/events/top-by-category', origin);
  url.searchParams.set('limit', DEFAULT_LIMIT.toString());
  url.searchParams.set('perCategory', DEFAULT_PER_CATEGORY.toString());

  const response = await getTopEventsByCategory(new NextRequest(url));
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Top events route failed: ${errorText}`);
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  const concurrency = getNumberEnv(
    process.env.EXA_PIPELINE_CONCURRENCY,
    DEFAULT_CONCURRENCY
  );

  try {
    const topEventsData = await fetchTopEvents(request);
    const categories = topEventsData?.categories ?? {};
    const categoryEvents = Object.values(categories).flat() as Array<{ ticker?: string }>;
    const tickers = Array.from(
      new Set(categoryEvents.map((event) => event.ticker).filter(Boolean))
    ) as string[];

    // For testing: limit to 1 event
    const testTickers = tickers.slice(0, 1);

    let consecutiveExaFailures = 0;
    let aborted = false;

    const results = await mapWithConcurrency(testTickers, concurrency, async (ticker) => {
      if (aborted) {
        return {
          eventTicker: ticker,
          outputs: [],
          exaCalls: 0,
          geminiCalls: 0,
          exaSuccess: false,
          exaError: 'Aborted by circuit breaker',
        } as PipelineEventResult;
      }

      const eventDetails = await fetchEventDetailsServer(ticker);
      const eventResult = await runPipelineForEvent({
        ticker: eventDetails.ticker,
        title: eventDetails.title,
        markets: eventDetails.markets ?? [],
      });

      if (!eventResult.exaSuccess && eventResult.exaCalls > 0) {
        consecutiveExaFailures += 1;
      } else if (eventResult.exaSuccess) {
        consecutiveExaFailures = 0;
      }

      if (consecutiveExaFailures >= 3) {
        aborted = true;
      }

      return eventResult;
    });

    const outputs: any[] = results.flatMap((result) => result.outputs);
    const evidenceRows = outputs
      .filter((output) => output.llmOutput.headline && output.sourceUrls && output.sourceUrls.length > 0)
      .map((output) => ({
        eventTicker: output.eventTicker,
        marketTicker: output.marketTicker,
        marketQuestion: output.marketQuestion,
        evidenceSentence: output.evidenceSentence ?? '',
        highlightScore: output.highlightScore ?? 0,
        classification: output.llmOutput.classification,
        headline: output.llmOutput.headline,
        explanation: output.llmOutput.explanation,
        sourceUrls: output.sourceUrls,
        sourceTitles: output.sourceTitles,
      }));

    if (evidenceRows.length > 0) {
      await (prisma as any).eventEvidence.createMany({
        data: evidenceRows,
        skipDuplicates: true,
      });
    }
    const stats = results.reduce(
      (acc, result) => {
        acc.eventsProcessed += 1;
        acc.marketsProcessed += result.outputs.length;
        acc.exaCalls += result.exaCalls;
        acc.geminiCalls += result.geminiCalls;
        return acc;
      },
      { eventsProcessed: 0, marketsProcessed: 0, exaCalls: 0, geminiCalls: 0 }
    );

    return NextResponse.json({
      results: outputs,
      stats,
      aborted,
    });
  } catch (error: any) {
    console.error('[exa-home] Pipeline error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Pipeline failed',
      },
      { status: 500 }
    );
  }
}
