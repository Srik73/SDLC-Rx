# SDLC Rx

SDLC Rx is a healthcare-focused, two-agent planning system. It accepts a natural-language description of a healthcare software product or module, generates a structured requirements specification, and then recommends and justifies a suitable software development lifecycle (SDLC).

The project uses Mastra workflows and agents, BM25 retrieval over a local document corpus, an OpenAI-compatible model endpoint such as LM Studio, and a React/Vite frontend.

> This project is for software-planning assistance. It is not legal, clinical, regulatory, or security advice. Do not enter real patient-identifying information.

## What the system does

A request passes through two sequential agents:

1. **Requirements Agent** converts the natural-language brief into a fixed-format healthcare requirements document.
2. **SDLC Selection Agent** reads that requirements document, selects one primary lifecycle, and explains the decision.

The output is written as Markdown and also saved as local preview artifacts under `artifacts/evaluation`.

The frontend displays the two Markdown outputs and provides a download button for the combined planning document.

## Architecture

```text
React/Vite frontend
        |
        | POST /api/workflows/requirements-then-sdlc/start-async
        v
Mastra workflow: requirements-then-sdlc
        |
        +--> Requirements Agent
        |       |
        |       +--> selected prompt pack: India or US
        |       +--> selected BM25 workspace: common + healthcare-in/us
        |
        +--> approximately 65-second delay
        |
        +--> SDLC Selection Agent
                |
                +--> selected prompt pack and BM25 workspace

        v
requirements + SDLC recommendation + Markdown/HTML artifacts
```

The main backend files are:

```text
src/mastra/index.ts       Mastra registration and workspace initialization
src/mastra/workflow.ts    Sequential requirements-then-SDLC workflow
src/mastra/health-agents.ts Agent definitions
src/mastra/prompts.ts     India/US prompt packs and prompt factories
src/mastra/rag.ts         Corpus-aware BM25 retrieval processor
src/mastra/workspace.ts   India/US workspace definitions and index paths
src/mastra/lm-studio.ts   OpenAI-compatible model adapter
src/mastra/config.ts      Environment-variable configuration
```

The frontend is located in:

```text
frontend/
```

## Requirements

- Node.js `>=22.13.0`
- npm
- A running OpenAI-compatible chat model endpoint. The default configuration expects LM Studio at `http://127.0.0.1:1234/v1`.
- A loaded model whose name matches `LM_STUDIO_MODEL`, or an equivalent model name configured in `.env`.

## Backend setup

From the repository root, install dependencies:

```bash
npm install
```

Create a local environment file from the example:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

The most important settings are:

```env
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=qwen/qwen3.5-9b
RIKU_WORKSPACE_ROOT=
MASTRA_DATABASE_URL=file:./architect.db
MASTRA_TELEMETRY_DISABLED=1
```

Start the model provider first, then start Mastra:

```bash
npm run dev
```

Mastra normally starts at:

```text
Studio: http://localhost:4111
API:    http://localhost:4111/api
```

The exact port printed by the Mastra CLI is authoritative if it differs from `4111`.

## Frontend setup

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server is configured for port `3000` and proxies `/api` requests to Mastra at `http://localhost:4111`.

Open the Vite URL shown in the terminal, normally:

```text
http://localhost:3000
```

If Mastra is running on another port or host, set the frontend API base URL before starting Vite:

```bash
VITE_MASTRA_API_BASE_URL=http://localhost:4111/api npm run dev
```

On Windows PowerShell:

```powershell
$env:VITE_MASTRA_API_BASE_URL = "http://localhost:4111/api"
npm run dev
```

If the frontend and Mastra are served from the same origin, the frontend can use the relative `/api` default and no environment variable is needed.

## Selecting the India or US corpus

The frontend includes a **Reference corpus** selector with two values:

```text
india
us
```

The selected value is sent as part of the workflow request:

```json
{
  "inputData": {
    "prompt": "Natural-language healthcare software brief",
    "corpus": "india"
  }
}
```

The backend validates the value with:

```ts
z.enum(['india', 'us'])
```

The selected corpus controls both retrieval and prompt instructions.

### India

```text
docs/ingested/common/**
docs/ingested/healthcare-in/**
```

### United States

```text
docs/ingested/common/**
docs/ingested/healthcare-us/**
```

The common material contains general requirements, security, SDLC, and supporting engineering documents. The jurisdiction folders contain healthcare and regulatory material specific to each selection.

The corresponding BM25 workspaces are created in `src/mastra/workspace.ts` and initialized in `src/mastra/index.ts`:

```ts
await indiaWorkspace.init();
await usWorkspace.init();
```

Both workspaces must be initialized before the startup corpus check runs.

## Dynamic jurisdiction prompts

The prompt packs are defined in `src/mastra/prompts.ts`:

- `PACKS.in` contains India-specific assumptions, evidence rules, and SDLC steering guidance.
- `PACKS.us` contains US-specific assumptions, evidence rules, and SDLC steering guidance.

The prompt factories are:

```ts
requirementsPromptForCorpus('india')
requirementsPromptForCorpus('us')
sdlcPromptForCorpus('india')
sdlcPromptForCorpus('us')
```

`src/mastra/workflow.ts` passes the selected prompt instructions to each agent at runtime:

```ts
await requirementsAgent.generate(message, {
  instructions: requirementsPromptForCorpus(inputData.corpus),
});
```

and:

```ts
await sdlcSelectionAgent.generate(message, {
  instructions: sdlcPromptForCorpus(inputData.corpus),
});
```

The workflow also includes an internal corpus marker such as:

```text
[SDLC_RX_CORPUS=us]
```

The RAG processor reads this marker, removes it from the search query, and selects the matching workspace.

The exported `REQUIREMENTS_PROMPT` and `SDLC_PROMPT` constants remain India defaults for older callers such as the Telegram integration. The workflow overrides them per request when a corpus is supplied.

## RAG behavior

`src/mastra/rag.ts` adds retrieved evidence to both agents' system messages.

For each request it:

1. Reads the selected corpus marker.
2. Searches the user's request with BM25 using the selected workspace.
3. Searches an additional fixed secure-SDLC query.
4. Removes duplicate results and keeps at most eight evidence blocks.
5. Excludes Spec Kit command files from retrieved evidence.
6. Injects short excerpts into the system context.

Only these file types are indexed:

```text
.txt
.md
.yaml
```

PDF, DOCX, and HTML files may be retained for provenance, but their extracted text must be present in an indexed supported format if the content should be searchable.

The workspace root is selected from `RIKU_WORKSPACE_ROOT`, `INIT_CWD`, the current working directory, or a repository ancestor containing `docs/ingested`.

## Workflow API

The registered workflow endpoint is:

```text
POST /api/workflows/requirements-then-sdlc/start-async
```

Example request:

```bash
curl -X POST http://localhost:4111/api/workflows/requirements-then-sdlc/start-async \
  -H "Content-Type: application/json" \
  -d '{
    "inputData": {
      "prompt": "Define requirements for a US clinic appointment and clinical decision support module.",
      "corpus": "us"
    }
  }'
```

The successful result contains the generated fields:

```json
{
  "requirements": "...",
  "sdlc": "...",
  "document": "...",
  "corpus": "us",
  "markdownPath": "...",
  "htmlPath": "..."
}
```

The workflow can also be invoked from TypeScript:

```ts
const result = await runRequirementsThenSdlc(
  prompt,
  'us',
);
```

The second argument defaults to `india` for backwards compatibility.

## Runtime timing

The workflow intentionally waits approximately 65 seconds between the Requirements Agent and SDLC Selection Agent calls. This is retained to reduce model rate-limit collisions in the current local setup.

As a result, the frontend shows a long-running progress state. The progress UI is time-based rather than a live subscription to individual Mastra step events.

## Outputs and artifacts

The workflow writes the latest combined output to:

```text
artifacts/evaluation/latest.md
artifacts/evaluation/latest.html
```

The frontend also renders the requirements and SDLC outputs as Markdown and lets the user download a combined `.md` file containing the selected corpus label.

## Corpus provenance and hashes

The current corpus inventory is documented in:

```text
docs/CORPUS_SOURCES.md
docs/CORPUS_SHA256.txt
```

`CORPUS_SHA256.txt` records SHA-256 hashes for retained files under `docs/ingested`. The hash manifest is provenance metadata; it is not used by the BM25 runtime to select or index documents.

If corpus files are added, removed, moved, or edited, regenerate the manifest from the repository root. On PowerShell:

```powershell
$root = (Resolve-Path .).Path

Get-ChildItem .\docs\ingested -Recurse -File |
  Sort-Object FullName |
  ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    $relative = $_.FullName.Substring($root.Length + 1).Replace('\\', '/')
    "$hash  $relative"
  } |
  Set-Content .\docs\CORPUS_SHA256.txt -Encoding ascii
```

## Telegram integration

The repository includes a Telegram adapter in:

```text
src/mastra/telegram-finance.ts
```

The filename is retained from the original project, but the registered agents and prompts are healthcare-oriented. Configure the optional variables in `.env` before enabling the integration:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MODE=polling
```

The compatibility helper `runRequirementsThenSdlc(prompt, corpus)` defaults to the India corpus when a caller does not provide a second argument.

## Validation commands

Backend typecheck:

```bash
npm run typecheck
```

Backend build:

```bash
npm run build
```

Combined backend validation:

```bash
npm run check
```

Frontend typecheck and build:

```bash
cd frontend
npm run typecheck
npm run build
```

If the backend fails during startup with a corpus BM25 error, check the following:

1. `docs/ingested/common` exists and contains supported files.
2. The selected folder is exactly `docs/ingested/healthcare-in` or `docs/ingested/healthcare-us`.
3. Files are non-empty `.txt`, `.md`, or `.yaml` files.
4. Both `indiaWorkspace.init()` and `usWorkspace.init()` are present in `src/mastra/index.ts`.
5. Mastra was restarted after corpus files changed.
6. `RIKU_WORKSPACE_ROOT` points to the repository containing the corpus.

If the selected corpus is US but the generated prompt still mentions India, verify that `workflow.ts` passes `sdlcPromptForCorpus(inputData.corpus)` and `requirementsPromptForCorpus(inputData.corpus)` through the per-call `instructions` options.

## Current scope and limitations

This is a local demonstration-oriented application. It currently does not provide authentication, saved projects, user accounts, multi-user isolation, editing of generated requirements, deployment automation, or production-grade regulatory validation.

Regulatory source documents are evidence for drafting and planning, not automatic proof that a requirement applies to a particular organization or product. Legal applicability, current status, entity scope, and final compliance decisions require review by qualified stakeholders.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
