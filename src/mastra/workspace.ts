import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';

export type Corpus = 'india' | 'us';

export const workspaceRoot = [
  process.env.RIKU_WORKSPACE_ROOT,
  process.env.INIT_CWD,
  process.cwd(),
  resolve(process.cwd(), '../../..'),
].find((path): path is string => Boolean(
  path && existsSync(join(path, 'docs/ingested')),
)) ?? process.cwd();

const commonPaths = [
  'docs/ingested/common/**/*.txt',
  'docs/ingested/common/**/*.md',
  'docs/ingested/common/**/*.yaml',
];

const jurisdictionPaths = {
  india: [
    'docs/ingested/healthcare-in/**/*.txt',
    'docs/ingested/healthcare-in/**/*.md',
    'docs/ingested/healthcare-in/**/*.yaml',
  ],
  us: [
    'docs/ingested/healthcare-us/**/*.txt',
    'docs/ingested/healthcare-us/**/*.md',
    'docs/ingested/healthcare-us/**/*.yaml',
  ],
} satisfies Record<Corpus, string[]>;

function createCorpusWorkspace(corpus: Corpus) {
  return new Workspace({
    id: `architect-workspace-${corpus}`,
    filesystem: new LocalFilesystem({
      basePath: workspaceRoot,
      readOnly: true,
    }),
    bm25: true,
    autoIndexPaths: [
      ...commonPaths,
      ...jurisdictionPaths[corpus],
    ],
    skills: ['skills'],
    tools: { enabled: false },
  });
}

export const indiaWorkspace = createCorpusWorkspace('india');
export const usWorkspace = createCorpusWorkspace('us');

// The agents require a default workspace configuration.
// The RAG processor selects the correct workspace per request.
export const architectWorkspace = indiaWorkspace;

export function workspaceForCorpus(corpus: Corpus) {
  return corpus === 'us' ? usWorkspace : indiaWorkspace;
}