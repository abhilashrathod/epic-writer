# Bootstrap prompt — Epic Writer, step 1 (skeleton)

How to use: create an empty folder `epic-writer`, put `AGENTS.md` at its root and `data-model.md` in `docs/`, open Claude Code there, and paste everything below the line.

---

You're bootstrapping **Epic Writer**, a single-user writing tool for epic fiction. Read `AGENTS.md` and `docs/data-model.md` in full before doing anything. They're the source of truth for rules, stack and schema. If anything below conflicts with them, they win; tell me about the conflict.

## Goal

Build the skeleton that every later feature sits on: a working monorepo, local MongoDB with transactions, sign-in, all 26 collections with indexes, the versioned commit path with tests, a job worker, design tokens, and a minimal screen to create and list projects. **No editor, codex UI or AI yet.**

At the end, I should be able to run `docker compose up -d mongo && pnpm dev`, sign in with GitHub, create a project called "Aryavarta", see it listed, and run a test suite that proves the commit path is correct.

## Work in this order, and stop for review after step 4

### 1. Monorepo

- pnpm workspace with the layout in `AGENTS.md`: `apps/web`, `apps/worker`, `packages/{core,db,schemas,fountain,ai,ui}`. Create `fountain` and `ai` as empty packages with an `index.ts` and a placeholder test so the workspace builds.
- Shared `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), ESLint flat config, Prettier.
- Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:indexes`.
- `CLAUDE.md` at the root containing only the line `@AGENTS.md`, so Claude Code loads the same rules.
- `.env.example` with every variable and a comment for each: `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `ALLOWED_GITHUB_LOGIN`, `KEY_ENCRYPTION_SECRET` (32 bytes, base64), `R2_*` (unused for now), `WORKER_ID`.
- `packages/schemas/env.ts`: Zod-validated env loader. Apps fail fast at startup with a clear message on a missing or invalid variable.

### 2. Local infrastructure

- `docker-compose.yml` with a `mongo` service running a **single-node replica set** (`rs0`) so transactions work. Use a healthcheck or init script that runs `rs.initiate()` once, idempotently. Persist data in a named volume.
- One `Dockerfile` that builds both apps; the container's command picks `web` or `worker`.
- `.github/workflows/ci.yml`: install, typecheck, lint, test (with a Mongo replica-set service), build.

### 3. `packages/db`

- Mongo client singleton (safe for Next.js dev hot reload).
- `collections.ts`: names for all 26 collections and a TypeScript type per collection, matching `docs/data-model.md` exactly, including the versioned envelope as a shared generic (`Versioned<T>`).
- `indexes.ts` + `pnpm db:indexes`: creates every collection and every index in the data-model table (skip the Atlas vector index locally; log that it was skipped). Idempotent: running it twice changes nothing.
- Repository helpers for plain collections (`users`, `projects`, `branches`, `commits`, `jobs`). Versioned collections are written **only** through `core.commit`, so don't add write helpers for them here; add read helpers (`readHeads`, `readHeadByKey`, `readAtSeq`).

### 4. `packages/core`: the commit path (most important step)

Implement `commit(db, input)`:

```ts
type Change =
  | { op: 'create'; collection: VersionedCollection; key?: string; data: object }
  | { op: 'update'; collection: VersionedCollection; key: string; data: object }   // full new version body
  | { op: 'delete'; collection: VersionedCollection; key: string };

commit(db, {
  projectId, branchId,
  message: string,
  author: { kind: 'user' | 'ai' | 'import'; userId?: string; proposalId?: string },
  auto?: boolean,
  changes: Change[],
}): Promise<{ seq: number; keys: string[] }>
```

Inside **one Mongo transaction**:

1. `$inc` `projects.seqCounter` atomically and take the new value as `seq`.
2. For each change: `create` inserts a new head (generate a UUID v7 `key` if none given). `update` and `delete` find the current head for `key` on that branch (throw `NotFound` if missing, or if it's already a tombstone), set `isHead: false, supersededSeq: seq` on it, and insert the new version (`deleted: true` for delete, carrying the last body).
3. Insert the `commits` row with `stats` counted per collection group, and set `branches.headSeq = seq`.
4. Commit the transaction, retrying on Mongo's transient transaction errors.

Also in `core`:

- `createProject(db, { ownerId, name, templateKey: 'blank' })`: creates the project with `seqCounter: 0`, a real `main` branch, and a default calendar in an initial commit (message "Create project"). The calendar has one era, 12 months of 30 days, and display format `{day} {month}, {year} {era}`.
- `DomainError` classes from `AGENTS.md`.
- `crypto/keys.ts`: `encryptKey(plain)` and `decryptKey(record)` with AES-256-GCM using `KEY_ENCRYPTION_SECRET`, returning `{ encryptedKey, iv, tag, last4 }`.

**Tests (Vitest, real local Mongo, a fresh database per test file):**

- Create → one head with `seq` 1 and `isHead: true`.
- Update → the old row has `isHead: false` and `supersededSeq` set; the new head carries the same `key` and a higher `seq`.
- Delete → a tombstone head; `readHeads` no longer returns it; `readAtSeq` before the delete still does.
- Updating or deleting a missing key throws `NotFound`, and **nothing** from that commit is written (atomicity: put a valid create before the bad change in the same commit and prove it rolled back).
- 20 commits fired concurrently on one project get 20 distinct, gap-free `seq` values, and every `commits` row matches.
- `readAtSeq(S)` returns exactly the versions live at S, across a sequence of creates, updates and deletes.
- The unique partial index on `{ projectId, key, branchId, seq }` rejects a duplicate version.
- `encryptKey`/`decryptKey` round-trip; a tampered tag fails.

**Stop here.** Show me the commit-path code and the test output before continuing.

### 5. `apps/worker`

- A loop that claims one job at a time with `findOneAndUpdate` (`status: 'queued'`, `runAfter <= now`) → `running` with `lockedBy` and `lockedUntil` (now + 5 min). It runs the handler for `type`, then marks the job `done` or `failed` (with `attempts++`, exponential backoff via `runAfter`, max 3 attempts).
- Reclaims jobs whose `lockedUntil` has passed (crashed worker).
- A `noop` handler that sleeps 500 ms and writes `output: { ok: true }`. Integration test: enqueue a noop job, run one worker tick, assert `done`.
- Graceful shutdown on SIGTERM: finish the current job, then exit.

### 6. `packages/ui`: design tokens

- `tokens.css` with CSS variables for two skins × two themes, selected by `html[data-skin="ink"|"sand"]` and `html[data-theme="light"|"dark"]`, with a `prefers-color-scheme` fallback when no theme is set.
- **Inkwell (default).** Light: bg `#ececef`, surface `#ffffff`, panel `#f6f6f8`, sunk `#e4e4e8`, ink `#0d0d0f`, muted `#55565c`, faint `#8d8e95`, line `#dcdce1`, primary `#0d0d0f` on `#ffffff`. Dark: bg `#000000`, surface `#0c0c0d`, panel `#17171a`, sunk `#1e1e22`, ink `#f3f3f4`, muted `#a3a3a9`, faint `#6d6d73`, line `#26262a`, primary `#ffffff` on `#000000`.
- **Sand.** Light: bg `#efe6d6`, surface `#fbf7f0`, panel `#f4ede1`, sunk `#ebe2d1`, ink `#1f1c17`, muted `#5f574b`, faint `#958b7b`, line `#e7ddcc`, primary `#ffc25c` on `#1f1c17`. Dark: bg `#151413`, surface `#1c1b19`, panel `#22211e`, sunk `#121110`, ink `#ece7dd`, muted `#aaa296`, faint `#7b746a`, line `#2c2a27`, primary `#f2b45a` on `#1a1712`.
- Semantic tokens for both skins: warn, bad, ok (each with a soft variant).
- Fonts: Inter Tight (UI and headings), Courier Prime (scripts), loaded with `next/font`.
- Tailwind configured to use these variables (`bg-surface`, `text-muted`, ...). No hex values anywhere outside `tokens.css`.
- Components: `Button` (`primary` = solid pill; `quiet` = text button), `Card` (filled tone, no border; `selected` inverts in Inkwell), `Field` (filled input with focus ring). **No borders** except the focus ring.

### 7. `apps/web`

- Auth.js with GitHub. Reject any login other than `ALLOWED_GITHUB_LOGIN`. Upsert the `users` row on first sign-in.
- `middleware.ts` protects everything except the sign-in page and `/api/health`.
- `GET /api/health` returns `{ ok, mongo: 'up'|'down', worker: lastHeartbeat }` (the worker writes a heartbeat to a `meta` doc in `jobs` or a small status record; your choice, but document it).
- Pages:
  - `/signin`: one quiet screen, "Epic Writer" and a "Sign in with GitHub" primary button.
  - `/`: project list. An empty state that names what a project is ("A world: one codex, any number of works") and a primary "New project" button. Creating takes a name, calls `core.createProject`, and lists the project with its creation date and commit count.
  - Theme switcher (Inkwell / Sand) and light/dark/system toggle in a small user menu; preference saved to `users.preferences`.
- API routes thin, as `AGENTS.md` describes: `GET/POST /api/projects`.
- Playwright smoke test: with auth mocked in test mode, create a project and see it listed.

## Out of scope for this step

Editor, codex screens, graph, entity types or templates beyond `blank`, AI providers, R2 uploads, branching UI, imports and exports. Don't stub UI for them.

## When you finish

Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` and paste the summary. Then list:

1. Anything you decided that `AGENTS.md` didn't cover (so I can add it there).
2. Anything in `docs/data-model.md` that looked wrong or ambiguous while implementing.
3. What you'd do first in step 2 (the editor).
