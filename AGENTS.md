# AGENTS.md — Epic Writer

Instructions for any coding agent (Claude Code, Codex, Cursor) working in this repo. Read this file fully before your first change. If a rule here conflicts with a request, stop and ask.

## What this is

Epic Writer is a single-user, cloud-hosted writing tool for epic-scale fiction (Mahabharata, Game of Thrones, Dune scale). You write screenplays (Fountain) and prose (Markdown) in a Beat-like editor. Beside it sits the **codex**: a typed, time-aware graph of the world (characters, places, dynasties, astras, events) that an AI collaborator extracts from the writing and checks the writing against.

The first real project is _Aryavarta_, a Mahabharata-inspired series. "Phase 1 done" means: S01E02 is written in Epic Writer, extracted into the codex, and a continuity check catches a real mistake.

Reference docs in this repo:

- `docs/product-spec.md` — every feature, its requirement ID (`ED-3`, `CX-7`) and its phase. Check a feature's phase before building it; don't build Phase 2 or Later items unless asked.
- `docs/data-model.md` — every collection and field. The schema is **locked for all phases**; don't change it without asking.
- `AGENTS.md` — this file. Update it when a convention changes.

## The rules that matter most

**Top priority: spend as few tokens as the job needs.** Tokens are money. Keep code simple, refactor only when a change needs it, and don't overcomplicate. Read only the files a step needs, run only the tests it touches while working, and keep reports short. Think like 10 year experienced programmer. Write efficient, high quality and easy to read code.

1. **All story-data writes go through `core.commit()`.** Never call `insertOne`/`updateOne` on a versioned collection from anywhere else.
2. **Versioned rows are never updated in place.** A change inserts a new version and closes the old head (`supersededSeq`, `isHead: false`). A delete inserts a tombstone (`deleted: true`).
3. **References use `key`, never `_id`.** Links, facts, scenes, beats and text markers point at stable keys. `_id` identifies one row version only.
4. **Every query is scoped by `projectId`**, and branch-aware queries also by `branchId`. Phase 1 only uses the `main` branch, but code must still pass `branchId` through.
5. **Typing never waits.** No network call, AI call or heavy computation sits in the editor's keystroke path. Saving is debounced and backgrounded.
6. **Only the worker calls AI providers.** The web app creates `jobs` rows; the worker claims and runs them. The browser never sees an API key and never calls a model.
7. **AI output never writes to the codex directly.** Extraction writes `proposals`; continuity writes `continuityIssues`. Only a user-accepted proposal becomes a commit.
8. **Validate at every boundary with Zod:** API input, AI output, entity fields (schemas generated from `entityTypes`), env vars. Invalid AI output is retried once with the errors, then the job fails visibly. Never persist half-valid data.
9. **Ignore `canonState: 'scrapped'`** in continuity checks, AI context and default views.
10. **No hardcoded entity types in app logic.** Types come from `entityTypes`; system behaviour comes from **traits** (`born`, `holdable`, `hasStrength`, ...). If you're about to write `if (type === 'character')`, check for a trait instead.
11. Don't add your own name as co-author in commits.

## This repo is public

Everything committed here is visible to anyone, forever (git history included). Never commit:
- Secrets: API keys, tokens, OAuth secrets, AUTH_SECRET, KEY_ENCRYPTION_SECRET,
  connection strings with credentials. They live only in .env (git-ignored) or the host's env settings.
- Personal data: real emails, the allowlisted GitHub login, IPs, names of real users.
- Story content: the author's Aryavarta notes, drafts, scripts, codex exports or
  backups. Test fixtures and seed data use generic or public-domain names only.
- Database dumps, uploaded files, logs or AI responses captured from real projects.

Before every commit: check `git diff --staged` for any of the above. If a secret
is ever committed, stop and tell the user. Don't try to hide it with a follow-up commit.
A pre-commit hook (`scripts/pre-commit.sh`, needs `gitleaks` installed) and a CI job scan for secrets; don't bypass them.

## Stack

| Layer           | Choice                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- |
| Language        | TypeScript, `strict: true`, no `any` (use `unknown` and narrow)                          |
| Package manager | pnpm workspaces                                                                          |
| Web             | Next.js App Router, React, route handlers for the API                                    |
| Editor          | CodeMirror 6; Fountain via the shared `classifyLine` (no Lezer grammar), Markdown mode for prose |
| UI              | Tailwind (theme from CSS variables), Radix primitives                                    |
| Data fetching   | TanStack Query                                                                           |
| Validation      | Zod                                                                                      |
| Database        | MongoDB (Atlas in prod, single-node replica set locally), **native driver, no Mongoose** |
| Jobs            | Worker process polling the `jobs` collection (no Redis)                                  |
| AI              | Vercel AI SDK with Anthropic, OpenAI, OpenRouter providers                               |
| Graph views     | React Flow + elkjs                                                                       |
| Files           | Cloudflare R2 via presigned URLs                                                         |
| Auth            | Auth.js, GitHub provider, allowlisted to one login                                       |
| Tests           | Vitest (unit/integration), Playwright (editor and UI flows)                              |

Use the current stable version of each when adding it; the lockfile pins it. Don't add a dependency that duplicates one above. Ask before adding anything heavy (an ORM, a state library, a CSS-in-JS library, a second UI kit).

## Repo layout

```
apps/
  web/        Next.js app: pages, route handlers, editor, codex, graph, review
  worker/     Node process: claims and runs jobs
packages/
  core/       Domain logic, framework-free: commit path, branch reads, "as of",
              calendar math, traits, continuity rules, key encryption
  db/         Mongo client, collection names and types, indexes, repositories
  schemas/    Zod schemas: API payloads, AI outputs, entity-field generator, env
  fountain/   line classifier, markers, scenes, exporters, CodeMirror extensions
  ai/         Provider adapter, prompts, context builder, cost tracking
  ui/         Design tokens (Inkwell, Sand), shared React components
docs/
  data-model.md
```

Dependency direction: `apps/*` → `packages/*`. `core` may depend on `db`, `schemas` and `fountain` only (it derives scenes and counts on save). `fountain` and `schemas` depend on nothing internal. Nothing in `packages/` imports from `apps/`.

## Commands

```
pnpm i                      install
docker compose up -d mongo  local MongoDB (replica set rs0)
pnpm dev                    web + worker in watch mode
pnpm db:indexes             create/verify all collections and indexes
pnpm typecheck              tsc across the workspace
pnpm lint                   eslint
pnpm test                   vitest (needs local mongo for integration tests)
pnpm test:e2e               playwright
pnpm build                  production build of web + worker
```

Before you say a task is done, run `pnpm typecheck && pnpm lint && pnpm test` and report the result. Don't claim something works without running it.

## Data model essentials

Full detail is in `docs/data-model.md`. What you must know without opening it:

- **26 collections.** 11 are **versioned**: `calendars, entityTypes, linkTypes, entities, links, facts, works, documents, storylines, beats, maps`. The rest are plain records.
- **Versioned envelope** on every versioned row: `_id, key, projectId, branchId, seq, supersededSeq, isHead, deleted, createdAt`.
- **`seq`** comes from `projects.seqCounter` via an atomic `$inc`, inside the commit transaction. One commit = one `seq` = one `commits` row.
- **Story time** is `{ start, end, precision }`, with integer day indexes from the project epoch. Calendars only format; they never store.
- **Narrative position** is `narrativeRef: { workKey, documentKey, sceneKey, order }`. `order` is a zero-padded path like `0001.0002.0014`. "As of" always names a work.
- **Facts** record values that change over story time. A card shows the latest fact at or before the selected story time; the field on the entity is only the starting value.
- **First appearances** (`entities.firstAppearances`, CX-5) are derived on save by `core/first-appearances.ts`: per work, the earliest scene that mentions the entry outside dialogue (any mention in prose), written as an `auto` commit only when it moves. Never set it by hand; undo keeps the current value.
- **History and undo** (BR-2): `core/history.ts` lists commits and their changes; `undoCommit` writes a new commit restoring prior versions (the `restore` change op brings back a tombstone). It refuses when a later commit touched the same rows. Working texts are outside commits and aren't undone.
- **Text markers** in Fountain/Markdown: scene identity `[[@s:<key>]]` (Markdown: `<!-- s:<key> -->`); mentions `[[@e:<key>|Display Name]]`. The editor hides markers; exporters strip them.

## Jobs and the worker

- The worker (`apps/worker`) claims one job at a time with an atomic `findOneAndUpdate` and locks it for 5 minutes (`lockedBy`, `lockedUntil`). A job whose lock expired (crashed worker) is reclaimed.
- `attempts` counts runs started (incremented on claim), so crash loops also hit the cap. Max 3 attempts; retries back off 30s, 60s. A type with no handler fails at once.
- Handlers live in `apps/worker/handlers.ts`, keyed by job `type`, and return the job's `output`.
- **Worker heartbeat** is a `jobs` row with `projectId: SYSTEM_PROJECT_ID` (all-zero ObjectId), `type: 'noop'`, `status: 'done'`, `input: { heartbeat: true, workerId }`; `updatedAt` is the last beat (every 15s). The schema has no status collection, and the row is never `queued`, so it's never claimed. Read it with `jobs.lastHeartbeat(db)`.
- SIGTERM/SIGINT: the worker finishes the current job, then exits.

## Web app

- Next 16: route protection lives in `apps/web/proxy.ts` (Next renamed `middleware.ts` to `proxy.ts`). It must export a function declaration named `proxy`. Still check the user inside every route handler and server action (`requireUser()`); the proxy alone isn't enough.
- One `.env` at the repo root serves web and worker; `next.config.ts` loads it.
- Env is validated lazily (`getEnv()` in `apps/web/lib/server.ts`), so `next build` needs no secrets. Anything that reads the session calls `currentUser()`, which marks the route dynamic.
- Route handlers wrap their body in `handle()` (`lib/http.ts`), which maps `DomainError`/Zod/401 errors to JSON `{ error }` and hides internals.
- E2E: Playwright runs `next dev` with `E2E_AUTH_BYPASS=1`, which signs in a fixed test user. It is ignored when `NODE_ENV=production`. Stop `pnpm dev` before `pnpm test:e2e`; both use `apps/web/.next`.

## Editor

- Fountain has no Lezer grammar. One pure function, `classifyLine(text, prevType, nextLine)` in `packages/fountain`, decides every line type, for the editor and the server alike.
- The editor keeps line types in a CodeMirror state field. Each edit re-classifies only the changed lines plus one line above and below, then continues downward only while types differ from before (a cue's type depends on its neighbours, dialogue on the cue above). Never re-classify the whole document per keystroke; decorations cover only the visible viewport.
- Budget: decoration updates stay under 16 ms per keystroke on a 60-page (~3,000-line) script. A benchmark test enforces it.
- Load CodeMirror language packs (`@codemirror/lang-markdown`) with a dynamic `import()` into a `Compartment`, only for documents that need them. A static import made Turbopack's dev server restart the shared entry chunk and reload pages in an endless loop.
- Never change the React tree around the editor (e.g. returning different wrappers in focus mode); hide chrome with CSS instead. A remount throws away unsaved text.
- Turbopack's on-disk dev cache is off (`turbopackFileSystemCacheForDev: false` in `apps/web/next.config.ts`): it went stale when code changed between dev runs and made pages reload in a loop ("HMR hash mismatch"). Keep it off. If a loop ever returns, stop `pnpm dev` and `rm -rf apps/web/.next`.

## Time and "as of"

- `@epic/core/asof` (pure, browser-safe) holds the only "as of" rules; every time-aware view uses it. An `AsOf` is `{ storyTime, workKey, order }`; `storyTime: null` means the end of time.
- A fact or link **has happened** when `storyTime.start <= asOf.storyTime` (untimed or `unknown` precision always has). It is **revealed** when it has no `narrativeRefs` in `asOf.workKey`, or one of them has `order <= asOf.order`. It applies when both hold; otherwise it is "future" (drawn dotted, or hidden for secrets). Scrapped never applies.
- A field's value as of a point is the latest applying fact for that field, else the entry's stored value (the starting value). Facts only exist for fields marked `timeVarying`.
- The `born` trait reads birth and death from date fields keyed `born`/`died`, else the type's first and second date fields. Ages come from `ageAt` and the project calendar.
- Views fetch `GET /api/projects/:id/world` (`useWorld`) and resolve client-side against `useWorkspace().asOf`. Opening an episode moves "as of" to it (its `storyTime`, its work, the end of its `orderPath`) unless pinned (WK-7).

## AI

- `packages/ai` wraps the Vercel AI SDK: `languageModel(provider, modelId, apiKey, mock)` and `generateStructured({ model, modelId, schema, system, prompt })`, which validates with Zod, retries once with the errors, then throws `AiOutputError` (rule 8). Prices live in `pricing.ts` (micro-dollars per token); unknown models report cost as unknown. Browser code imports only `@epic/ai/defaults` and `@epic/ai/pricing`.
- The web app queues AI work with `POST /api/projects/:id/jobs` (`useAiJob`), after core's `enqueueAiJob` checks the owner's key and the monthly cap. Job types: `extract`, `continuity`, `ask` (usage task `chat`).
- Worker handlers live in `apps/worker/handlers/<task>.ts` and start with `prepareAi(db, job, task, keySecret, mock)`, which returns the project context, the model and `record(usage, promptVersion)`. A handler returns its output with `costMicros` (null cost → `costKnown: false`); the UI shows it with `RunCost` after every run (AI-10).
- Every handler supplies a deterministic mock responder. With `AI_MOCK=1` (never in production) all providers answer from it; tests and e2e use this and never call a real provider. The e2e setup runs the worker with `AI_MOCK=1`.
- Extraction (`extract` job) writes one `proposals` row per run. Identity matching (AI-5) is code (`core/identity.ts`); entries a proposal creates are `new:<n>` refs until applied. `applyProposal` builds accepted changes with the same builders as hand edits (`entityChange`, `linkChange`, `factChange`) and commits them as one commit (author `ai`).
- Prompts carry a `PROMPT_VERSION` constant, recorded in `aiUsage`. AI context is built from the codex as of the relevant point and excludes scrapped data (rule 9).
- Failures a retry can't fix (`AiOutputError`, `Invalid`, `NotFound`, `Forbidden`) fail the job at once; network and rate-limit errors retry with backoff.

## Code conventions

- Named exports only, except where Next.js requires a default export.
- Files `kebab-case.ts`, React components `PascalCase.tsx`, one component per file.
- Domain errors: throw `DomainError` subclasses from `core` (`NotFound`, `Conflict`, `Invalid`, `Forbidden`). Route handlers map them to 404/409/422/403. Never leak stack traces to the client.
- Route handlers stay thin: auth → parse with Zod → call `core` → map result. No business logic in `apps/web/app/api`.
- Mongo access goes through repository functions in `packages/db`. No raw collection access in `apps/`.
- Dates in the database are `Date`. Story-time values are integers, never `Date`.
- IDs: `_id` is `ObjectId`; `key` is a UUID v7 string (time-sortable).
- Money and tokens are integers (cost in micro-dollars).
- No `console.log` in committed code; use the shared logger.
- Comments explain _why_, not what.

## UI and design rules

- **Two skins:** `ink` (Inkwell, default) and `sand`, set by `data-skin` on `<html>`. Both have light and dark. All colours come from CSS variables in `packages/ui/tokens.css`. **No hex values in components.**
- **Tone, not lines.** Separate regions with background tone (bg, surface, panel), not borders. Don't add a border without a reason that tone can't solve.
- **One primary action per screen** (black pill in Inkwell, amber pill in Sand). Everything else is a quiet text button.
- **Selection** in Inkwell inverts: the selected card or row goes solid ink with surface-coloured text.
- **Type:** Inter Tight for UI and headings in Inkwell; Courier Prime for scripts. Script pages follow industry screenplay layout.
- **Copy:** plain, active, specific. Buttons say what happens ("Commit accepted", "Save to codex"). Errors say what went wrong and how to fix it. Use "codex", never "bible".
- **AI runs on request.** Never trigger extraction, continuity or chat automatically. Show cost after a run.
- Respect `prefers-reduced-motion`. Every interactive element is keyboard-reachable with a visible focus ring.

## Testing rules

- `packages/core` and `packages/fountain` need tests for every exported function. These are the packages where a bug corrupts canon or writing.
- Integration tests run against a real local MongoDB (replica set), never mocks, for anything touching transactions or indexes. Each test uses its own database name and drops it after.
- Editor behaviour (auto-detection, Tab cycling, autocomplete, markers surviving edits) is covered by Playwright.
- A bug fix includes a test that fails before the fix.

## How to work in this repo

- Keep changes small and focused. One concern per commit, with a conventional message (`feat(core): ...`, `fix(editor): ...`).
- **Stage, don't commit.** Agents only `git add` their changes. Never `git commit` or `git push` until the user explicitly says so; they review staged changes first. Suggest a conventional commit message when handing over.
- Read before you write: check `docs/data-model.md` and existing patterns before adding a collection field, route or component.
- **Ask before:** changing the schema or the versioned envelope, adding a dependency outside the stack table, changing a rule in this file, or deleting user data in a migration.
- When something is ambiguous, pick the option most consistent with this file and say which you picked.
- If you change a convention, update this file in the same change.

## Import, export and backups

- Fountain import (IO-2): `core.importFountain` creates the script with `createDocument`, takes its title from the Fountain title page (else the file name), normalises line endings and assigns scene keys before the first save. The browser reads the file and posts it as JSON (`@epic/schemas/io`); there is no upload storage.
- Fountain/Markdown export (IO-3): `core.exportDocumentText` strips identity markers with `stripMarkers`; Fountain files start with a `Title:` page so they re-import under the same title.
- Backups (IO-7): `core.exportProject` returns every row of every project-scoped collection (`PROJECT_COLLECTIONS` in `packages/db/backup.ts`), all versions, as EJSON. It never includes `users` (AI keys) or `templates`; only the owner's name. Download it from project settings.
- Nightly backups: the worker enqueues one `export` job per project per 24h (checked every 10 minutes) and writes `BACKUP_DIR/<projectId>/<YYYY-MM-DD>.json.gz`, keeping the newest 14. `BACKUP_DIR` must be absolute and outside the repo; unset turns nightly backups off. Never commit backups: this repo is public.

## Glossary

- **Project** — one world (Aryavarta). Hard wall: nothing crosses projects.
- **Work** — one telling of the world: a series, novel or film, with its own structure levels.
- **Document** — a node in a work's tree: a season (container) or an episode/chapter (text).
- **Codex** — the project's entities, links and facts. (Never "bible" in UI or code.)
- **Entity / entity type / trait** — a named thing; its user-defined template; a system behaviour a type opts into.
- **Link** — a typed edge between entities: relation, kinship, teaching, ownership, causal, knowledge.
- **Fact** — a time-stamped value change on an entity (strength, holder, rank, status).
- **As of** — the codex resolved at a point in story time and narrative order.
- **Canon state** — canon, tentative or scrapped.
- **Commit / seq** — one atomic change set and its sequence number.
- **Branch** — `main` in Phase 1; drafts and adaptation sources in Phase 2.
- **Proposal** — AI-extracted changes waiting for review.
