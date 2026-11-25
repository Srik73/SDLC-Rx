import type {
  InputProcessorOrWorkflow,
  ProcessInputArgs,
  ProcessInputResult,
} from '@mastra/core/processors';
import {
  workspaceForCorpus,
  type Corpus,
} from './workspace';

const SKIP_IDS = /(?:clarify|specify|analyze)-command/i;
const MAX_HIT_CHARS = 1200;
const TOP_K = 3;

const SDLC_QUERY =
  'secure software development lifecycle SSDLC application security lifecycle threat modelling VA PT iterative systems engineering';

const CORPUS_MARKER = /\[SDLC_RX_CORPUS=(india|us)\]/i;

type SearchHit = {
  id: string;
  content: string;
};

const partText = (part: unknown): string => {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';

  const record = part as Record<string, unknown>;

  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;

  return '';
};

const messageText = (message: { content?: unknown }): string => {
  const content = message.content;

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content.map(partText).join('\n');
  }

  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;

    if (typeof record.content === 'string') {
      return record.content;
    }

    if (Array.isArray(record.parts)) {
      return record.parts.map(partText).join('\n');
    }
  }

  return '';
};

function userMessages(
  messages: Array<{ role?: string; content?: unknown }>,
) {
  return messages.filter((message) => message.role === 'user');
}

function corpusFromMessages(
  messages: Array<{ role?: string; content?: unknown }>,
): Corpus {
  for (const message of [...userMessages(messages)].reverse()) {
    const match = messageText(message).match(CORPUS_MARKER);

    if (match?.[1]?.toLowerCase() === 'us') {
      return 'us';
    }

    if (match?.[1]?.toLowerCase() === 'india') {
      return 'india';
    }
  }

  // Safe default for existing callers that do not yet send a marker.
  return 'india';
}

function queryFromMessages(
  messages: Array<{ role?: string; content?: unknown }>,
) {
  for (const message of [...userMessages(messages)].reverse()) {
    const text = messageText(message)
      .replace(CORPUS_MARKER, ' ')
      .replace(/(^|\s)\/pdf\b/gi, ' ')
      .trim();

    if (text && !text.startsWith('/')) {
      return text;
    }
  }

  return '';
}

export async function retrieveEvidence(
  corpus: Corpus,
  query: string,
): Promise<SearchHit[]> {
  const trimmed = query.trim();

  if (trimmed.length < 8) {
    return [];
  }

  const workspace = workspaceForCorpus(corpus);

  const results = await workspace.search(trimmed, {
    mode: 'bm25',
    topK: TOP_K,
  });

  return results.filter((hit) => !SKIP_IDS.test(hit.id));
}

function uniqueHits(...lists: SearchHit[][]) {
  const seen = new Set<string>();
  const merged: SearchHit[] = [];

  for (const list of lists) {
    for (const hit of list) {
      if (seen.has(hit.id)) continue;

      seen.add(hit.id);
      merged.push(hit);
    }
  }

  return merged.slice(0, 8);
}

export function formatEvidence(
  hits: SearchHit[],
  corpus: Corpus,
) {
  if (hits.length === 0) {
    return [
      `Retrieved evidence: none for the ${corpus} corpus.`,
      'Mark every regulatory, security, and numeric claim NEEDS-VALIDATION.',
      'Do not invent thresholds or legal applicability.',
    ].join('\n');
  }

  const blocks = hits.map((hit, index) => {
    const excerpt = hit.content
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_HIT_CHARS);

    return `[${index + 1}] ${hit.id}\n${excerpt}`;
  });

  const jurisdictionFolder =
    corpus === 'india' ? 'healthcare-in' : 'healthcare-us';

  return [
    `Retrieved evidence from docs/ingested/common and docs/ingested/${jurisdictionFolder}.`,
    'The evidence has already been searched. Do not call search tools.',
    'Treat retrieved spec-kit command files as irrelevant. Do not interview.',
    ...blocks,
  ].join('\n\n');
}

export const assertCorpusSearchable = async () => {
  for (const corpus of ['india', 'us'] as const) {
    const hits = await retrieveEvidence(
      corpus,
      'healthcare privacy security software requirements',
    );

    if (hits.length === 0) {
      throw new Error(`${corpus} corpus BM25 index returned no hits`);
    }
  }
};

export const ragContextProcessor = {
  id: 'rag-context-processor',
  name: 'RAG Context',

  async processInput({
    messages,
    systemMessages,
  }: ProcessInputArgs): Promise<ProcessInputResult> {
    const query = queryFromMessages(messages);

    if (!query) {
      return { messages, systemMessages };
    }

    const corpus = corpusFromMessages(messages);

    const evidence = formatEvidence(
      uniqueHits(
        await retrieveEvidence(corpus, query),
        await retrieveEvidence(corpus, SDLC_QUERY),
      ),
      corpus,
    );

    return {
      messages,
      systemMessages: [
        ...systemMessages,
        {
          role: 'system',
          content: evidence,
        },
      ],
    };
  },
} as InputProcessorOrWorkflow;