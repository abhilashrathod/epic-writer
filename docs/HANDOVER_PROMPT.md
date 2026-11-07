# Handover prompt: Epic Writer, after Phase 1 build order

Paste everything below the line into a fresh Claude Code session opened at the repo root.

---

You're continuing work on **Epic Writer**, a single-user writing tool for epic fiction (screenplays in Fountain, prose in Markdown, plus a time-aware codex of the world and AI extraction/continuity). Read `AGENTS.md` fully before doing anything; it holds the binding rules, stack and conventions, including sections on the editor, time and "as of", AI, and import/export. Then read `docs/product-spec.md` (requirement IDs and phases) and `docs/data-model.md` (locked schema; ask before changing it).

## Where things stand

All six steps of the Phase 1 build order (spec section 6) are done, committed and pushed to `origin/main` (last commit `f342e01`):
1. Skeleton: pnpm monorepo, Next.js 16 web app, worker, MongoDB replica set, GitHub auth, 26 collections, versioned commit path.
2. Editor: Fountain/Markdown, Beat-style Enter/Tab, works tree, autosave with conflict prompt and local buffer, version history, focus mode.
3. Codex: templates, entry types and traits, entries, cards, mentions in the editor, connections.
4. Graph and time: facts, "as of", ages, family trees, relationship web, lineage, timeline, storylines.
5. AI: bring-your-own keys, AI settings and spend cap, extraction with PR-style review, continuity checks, Ask the codex.
6. Import/export: notes import (md, txt, docx, pdf) with batch extraction, Fountain import/export, JSON backups on demand and nightly.

Current checks: typecheck, lint and Prettier clean; 263 unit/integration tests; 35 Playwright e2e tests; build passes.

## What's pending (Phase 1 requirements in spec section 5 not yet complete)

Do these in this order unless the user says otherwise. Before calling any item done, check every P1 requirement in the sections it touches and report anything left out.

**Group 1, affects the Phase 1 "done when" checks:**
- **CX-5 first appearance per work:** `entities.firstAppearances` is never written. Record it (e.g. on save, from scene mentions, earliest narrative order per work). The continuity rule "name used too early" (stored as `knowledge-leak`) reads this field and currently never fires.
- **BR-2 commit history and undo (P1 for history and undo; the UI is P2):** a commit history listing (what changed, by whom: user, AI, import) and undo of any commit, implemented in core as a new commit that restores prior versions (never delete history).
- **WK-5 episode details:** logline, summary and key events per episode or chapter, arc summary per container, and a generated episode/chapter guide from these.

**Group 2, project settings:**
- **PR-1:** rename and archive projects.
- **PR-3:** a calendar editor (months, weekdays, eras with direction, display format), and several calendars on one shared timeline.
- **PR-4:** a units editor with conversions.
- **PR-5:** a project overview editor (logline, tagline, synopses, premise, genres, tone, hook, arc, key questions, themes).
- **PR-6:** visual references (palette, mood keywords). The mood-board images need R2 uploads: ask before setting up R2.
- **PR-7:** inspirations.

**Group 3, smaller gaps:**
- **WK-2:** user-defined work structure levels (e.g. Book → Part → Chapter, Act → Sequence). Today levels are fixed defaults per medium in `packages/core/works.ts`.
- **ED-11:** focus mode is missing the ask, check, history and "more" controls (it has Scenes and Esc).
- **CX-8 / CX-9:** dynasty pages need "throne holders over time" and a history timeline; kingdom pages need a connection diagram (the graph page exists separately).
- **CX-12:** UI to mark a recorded change (fact) tentative or scrapped.
- **EP-1 / EP-5 / EP-6:** template gaps:
  - geography connection types ("borders", "flows through", "crosses");
  - rule-system fields (users, counters, conditions) in every template;
  - artifact properties marked "changes over time".
- **CX-2 / CX-5:** image fields and images wait on R2 uploads.

**Group 4:** deployment (PF-2). The hosting choice (Railway vs Fly.io) is an open question in the spec; ask the user.

## How the user wants you to work

- **Never commit or push unless the user explicitly says so in that turn.** Stage with `git add -A` and stop. When asked to commit, don't add a Co-Authored-By line (AGENTS.md rule 11). Suggest a conventional commit message when handing over.
- The repo is **public**:
  - a gitleaks pre-commit hook and a CI job scan for secrets;
  - never bypass them; replace key-like test fixtures with obviously fake values;
  - no real names, emails or story content in fixtures.
- **Tokens matter.** Keep code simple, read only what a step needs, keep reports short and plain.
- **The user likes parallel agents for big steps.** The pattern that worked:
  1. Build the shared foundation yourself.
  2. Stage, then `git stash create` to get a snapshot commit.
  3. Make one `git worktree add --detach <scratchpad>/wt-x <sha>` per agent, with `pnpm i` in each.
  4. Give each agent a distinct e2e port and db (`E2E_PORT=32xx E2E_DB=epic-writer-e2e-x`) and tell it not to commit.
  5. Merge with `git diff --cached --binary <base>` from each worktree, then `git apply --3way --index` in the main repo.
  6. Resolve conflicts by keeping both sides, run every check, then remove the worktrees.
- **Before saying a task is done, run:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`, plus gitleaks on staged changes. Report the numbers.

## Environment gotchas

- **Docker Mongo runs on port 27018**, not 27017. A Homebrew `mongod` owns 27017 on this Mac; leave it alone. `MONGODB_URI=mongodb://localhost:27018/?replicaSet=rs0`. Start it with `docker compose up -d mongo`.
- **e2e needs no dev server on port 3000.** It uses the app's `.next` folder, so check `lsof -nP -iTCP:3000 -sTCP:LISTEN` first; if the user's `pnpm dev` is running, ask before stopping it. Never delete `apps/web/.next` while a dev server is running.
- **Turbopack's on-disk dev cache is turned off** in `apps/web/next.config.ts`. It caused endless reload loops ("HMR hash mismatch"); keep it off.
- **Load CodeMirror language packs lazily** (see AGENTS.md "Editor"). A static import of `@codemirror/lang-markdown` caused a Turbopack reload loop.
- **e2e runs the worker with `AI_MOCK=1`.** AI answers from deterministic mock responders, and no test ever calls a real AI provider.
- **Scripted edits must fail loudly.** When editing files with scripts, assert that the old text exists before replacing it; silent no-op replacements caused bugs before. Quote globs in zsh (e.g. `--include='*.ts'`).
- **Keep `rm` out of compound shell commands.** The safety check blocks `rm` inside long commands with heredocs; delete files with a separate, simple command.
- **Prettier ignores `*.md`.** Don't reformat the user's docs.

## Start here

Ask the user whether to begin with Group 1 (first appearances, history and undo, episode details), then plan the work and build.
