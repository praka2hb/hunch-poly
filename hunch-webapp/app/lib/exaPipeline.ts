import 'server-only';

import { GoogleGenerativeAI } from '@google/generative-ai';

const EXA_API_URL = 'https://api.exa.ai/search';
const EXA_API_KEY = process.env.EXA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const DEFAULT_EXA_TYPE = 'auto';
const DEFAULT_EXA_NUM_RESULTS = 5;
const DEFAULT_HIGHLIGHT_THRESHOLD = 0.12;
const DEFAULT_GEMINI_MAX_TOKENS = 256;

const CLASSIFICATIONS = new Set([
  'REQUIREMENT',
  'DELAY',
  'CONFIRMATION',
  'RISK',
  'NONE',
] as const);

export type Classification =
  | 'REQUIREMENT'
  | 'DELAY'
  | 'CONFIRMATION'
  | 'RISK'
  | 'NONE';

export interface ExaSearchResult {
  title?: string;
  url?: string;
  publishedDate?: string | null;
  highlights?: string[];
  highlightScores?: number[];
}

export interface ExaSearchResponse {
  requestId?: string;
  results?: ExaSearchResult[];
}

export interface EventWithMarkets {
  ticker: string;
  title: string;
  markets?: Array<{
    ticker: string;
    title?: string;
  }>;
}

export interface PipelineMarketOutput {
  eventTicker: string;
  marketTicker: string;
  marketQuestion: string;
  evidenceSentence: string | null;
  highlightScore: number | null;
  sourceUrls: string[];
  sourceTitles: string[];
  llmOutput: {
    classification: Classification;
    headline: string | null;
    explanation: string | null;
  };
}

export interface PipelineEventResult {
  eventTicker: string;
  outputs: PipelineMarketOutput[];
  exaCalls: number;
  geminiCalls: number;
  exaSuccess: boolean;
  exaError?: string;
  logs?: string[];
}

function getNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const HIGHLIGHT_THRESHOLD = getNumberEnv(
  process.env.EXA_PIPELINE_HIGHLIGHT_THRESHOLD,
  DEFAULT_HIGHLIGHT_THRESHOLD
);

const GEMINI_MODEL_NAME = 'gemini-2.5-flash-lite';

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return geminiClient;
}

export async function fetchExaForEvent(
  eventTitle: string,
  highlightQuery: string
): Promise<ExaSearchResponse> {
  if (!EXA_API_KEY) {
    throw new Error('Missing EXA_API_KEY');
  }

  const body = {
    query: eventTitle,
    category: 'news',
    type: DEFAULT_EXA_TYPE,
    numResults: DEFAULT_EXA_NUM_RESULTS,
    contents: {
      highlights: {
        numSentences: 3,
        highlightsPerUrl: 1,
        query: highlightQuery,
      },
    },
  };

  const response = await fetch(EXA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Exa API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export interface HighlightEvidence {
  sentence: string;
  score: number;
  source: string;
  url?: string;
  publishedDate?: string | null;
}

export function getTopHighlights(
  results: ExaSearchResult[] = [],
  limit = 5
): HighlightEvidence[] {
  const allHighlights: HighlightEvidence[] = [];

  console.log(`[exaPipeline] Processing ${results.length} Exa results for highlights`);

  for (const result of results) {
    const highlights = result.highlights ?? [];
    const scores = result.highlightScores ?? [];
    const pairCount = Math.min(highlights.length, scores.length);

    for (let i = 0; i < pairCount; i += 1) {
      const score = scores[i];
      const sentence = highlights[i];

      if (typeof score !== 'number') continue;

      if (
        typeof sentence !== 'string' ||
        !sentence.trim()
      ) {
        continue;
      }

      allHighlights.push({
        sentence: sentence.trim(),
        score,
        source: result.title || 'Unknown Source',
        url: result.url,
        publishedDate: result.publishedDate ?? null,
      });
    }
  }

  // Sort by score descending and return top N
  const sorted = allHighlights.sort((a, b) => b.score - a.score).slice(0, limit);
  console.log(`[exaPipeline] Found ${sorted.length} valid highlights after filtering`);
  return sorted;
}

export function buildGeminiPrompt(
  marketQuestion: string,
  evidenceList: HighlightEvidence[]
): string {
  const evidenceText = evidenceList
    .map(
      (e, i) =>
        `[${i + 1}] "${e.sentence}" (Score: ${e.score.toFixed(2)}, Source: ${e.source})`
    )
    .join('\n');

  return `You are analyzing evidence for a prediction market event.

Event Question: "${marketQuestion}"

Evidence (top ${evidenceList.length} by relevance score):
${evidenceText}

TASK:
1. Read ALL evidence above
2. Synthesize a unified headline that captures the strongest signal (max 14 words)
3. Classify the overall signal as ONE of: REQUIREMENT | DELAY | CONFIRMATION | RISK | NONE
4. Explain briefly why this matters (max 20 words)

RULES:
- If multiple sources agree, that strengthens the signal
- If sources conflict, note uncertainty in classification
- Use plain language, no jargon
- If evidence is weak/unclear, return NONE

OUTPUT (JSON only):
{
  "thinking": "<brief reasoning>",
  "classification": "REQUIREMENT | DELAY | CONFIRMATION | RISK | NONE",
  "headline": "<string or null>",
  "explanation": "<string or null>"
}`;
}

export async function callGemini(prompt: string): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL_NAME,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: DEFAULT_GEMINI_MAX_TOKENS,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function truncateToWordLimit(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text.trim();
  return words.slice(0, limit).join(' ');
}

export function validateLLMOutput(raw: string): {
  classification: Classification;
  headline: string | null;
  explanation: string | null;
} {
  try {
    const parsed = JSON.parse(raw);

    // Log thinking for debugging (optional)
    if (parsed?.thinking) {
      console.log('[exaPipeline] Gemini thinking:', parsed.thinking.substring(0, 200));
    }

    const classification = typeof parsed?.classification === 'string'
      ? parsed.classification.toUpperCase()
      : 'NONE';

    if (!CLASSIFICATIONS.has(classification as Classification)) {
      return { classification: 'NONE', headline: null, explanation: null };
    }

    if (classification === 'NONE') {
      return { classification: 'NONE', headline: null, explanation: null };
    }

    if (typeof parsed?.headline !== 'string' || typeof parsed?.explanation !== 'string') {
      return { classification: 'NONE', headline: null, explanation: null };
    }

    let headline = parsed.headline.trim();
    let explanation = parsed.explanation.trim();

    if (!headline || !explanation) {
      return { classification: 'NONE', headline: null, explanation: null };
    }

    if (countWords(headline) > 14) {
      headline = truncateToWordLimit(headline, 14);
    }

    if (countWords(explanation) > 20) {
      explanation = truncateToWordLimit(explanation, 20);
    }

    return {
      classification: classification as Classification,
      headline,
      explanation,
    };
  } catch {
    return { classification: 'NONE', headline: null, explanation: null };
  }
}

export async function runPipelineForEvent(
  event: EventWithMarkets
): Promise<PipelineEventResult> {
  const eventTicker = event.ticker;
  const markets = event.markets ?? [];
  const logs: string[] = [];

  const log = (msg: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const line = `[${timestamp}] ${msg} ${data ? JSON.stringify(data) : ''}`;
    console.log(line);
    logs.push(line);
  };

  if (!event.title || markets.length === 0) {
    return {
      eventTicker,
      outputs: [],
      exaCalls: 0,
      geminiCalls: 0,
      exaSuccess: false,
      exaError: 'Missing event title or markets',
      logs,
    };
  }

  const startedAt = Date.now();
  const highlightQuery = [
    event.title,
    ...markets
      .map((market) => market.title)
      .filter((title): title is string => Boolean(title))
      .slice(0, 3),
  ]
    .join(' ')
    .trim();
  let exaResponse: ExaSearchResponse;

  try {
    exaResponse = await fetchExaForEvent(event.title, highlightQuery);
    log('Exa call success', {
      resultCount: exaResponse.results?.length ?? 0,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    log('Exa call failed', error?.message);
    return {
      eventTicker,
      outputs: [],
      exaCalls: 1,
      geminiCalls: 0,
      exaSuccess: false,
      exaError: error?.message || 'Exa call failed',
      logs,
    };
  }

  // Determine top highlights with logging
  const resultHighlights = exaResponse.results ?? [];
  const validHighlights: HighlightEvidence[] = [];

  log(`Processing ${resultHighlights.length} Exa results for highlights`);

  for (const result of resultHighlights) {
    const highlights = result.highlights ?? [];
    const scores = result.highlightScores ?? [];
    const pairCount = Math.min(highlights.length, scores.length);

    for (let i = 0; i < pairCount; i += 1) {
      const score = scores[i];
      const sentence = highlights[i];

      if (typeof score !== 'number') continue;

      if (typeof sentence !== 'string' || !sentence.trim()) continue;

      validHighlights.push({
        sentence: sentence.trim(),
        score,
        source: result.title || 'Unknown Source',
        url: result.url,
        publishedDate: result.publishedDate ?? null,
      });
    }
  }

  const topHighlights = validHighlights.sort((a, b) => b.score - a.score).slice(0, 3);

  if (topHighlights.length === 0) {
    log('No highlights found in Exa results');
    return {
      eventTicker,
      outputs: [],
      exaCalls: 1,
      geminiCalls: 0,
      exaSuccess: true,
      logs,
    };
  }

  log('Sending top highlights to Gemini', {
    count: topHighlights.length,
    scores: topHighlights.map(h => h.score.toFixed(3)),
  });

  // Use event title as the "question" for Gemini
  const eventQuestion = event.title;
  const prompt = buildGeminiPrompt(eventQuestion, topHighlights);

  let llmOutput: { classification: Classification; headline: string | null; explanation: string | null };
  let geminiCalls = 0;

  try {
    const raw = await callGemini(prompt);
    llmOutput = validateLLMOutput(raw);
    geminiCalls = 1;
    log('Gemini call success', {
      classification: llmOutput.classification,
      headline: llmOutput.headline,
    });
  } catch (error: any) {
    log('Gemini call failed', error?.message);
    llmOutput = { classification: 'NONE', headline: null, explanation: null };
  }

  // Return single output for the event with all 3 source URLs
  const output: PipelineMarketOutput = {
    eventTicker,
    marketTicker: eventTicker,
    marketQuestion: eventQuestion,
    evidenceSentence: topHighlights.map(h => h.sentence).join(' | '),
    highlightScore: topHighlights[0].score,
    sourceUrls: topHighlights.map(h => h.url).filter((url): url is string => Boolean(url)),
    sourceTitles: topHighlights.map(h => h.source),
    llmOutput,
  };

  return {
    eventTicker,
    outputs: [output],
    exaCalls: 1,
    geminiCalls,
    exaSuccess: true,
    logs,
  };
}
