# Epic Writer: product spec

Features, requirements and phases. Companion docs: `AGENTS.md` (how to build), `docs/data-model.md` (schema). Requirement IDs (`ED-3`, `CX-7`) are stable, so reference them in commits and issues.

## 1. Vision

Epic Writer is a writing tool for epic-scale fiction: Game of Thrones, Lord of the Rings, the Mahabharata, Dune. The script and the world it lives in are one connected system. You write in a Beat-fast editor; beside it sits a **codex**, a living, time-aware graph of the world, and an AI collaborator that knows that world, extracts from your writing, and checks your writing against it.

It's built first for one writer (Abhi) and one world (_Aryavarta_, a Mahabharata-inspired series). Public release is optional, not a goal.

## 2. Principles

1. **The editor comes first.** Typing never waits on AI, the database or the network.
2. **Everything is an entry, and everything connects.** One graph, many views.
3. **Time is first-class.** Facts and relationships have a _when_, in story time and in narrative order.
4. **The AI proposes; the writer decides.** Nothing enters canon without review.
5. **Collaborator, not cheerleader.** The AI points out flaws and suggests better options. It doesn't flatter, and it doesn't nag.
6. **AI runs on request.** No background AI spend while writing.
7. **Projects are walls.** One world never leaks into another.
8. **Flexible by default.** Entry types, fields and structure are defined per project, not hardcoded.
9. **No lock-in.** Plain-text scripts and a full JSON export at all times.

## 3. Users and scope

- **Primary user:** a screenwriter and novelist working on long, serialized worlds with heavy lore.
- **Single user** in Phase 1 and 2, cloud-hosted, usable from any device. The schema allows collaborators later.
- **Media:** TV series, novels, films and trilogies, in one project against one codex.
- **Formats:** screenplay (Fountain) and prose (Markdown).
- **Adaptations:** writing a series from an existing book (Phase 2).

## 4. Core concepts

| Concept        | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| Project        | One world, with its own codex, calendars, units, works and AI settings                  |
| Work           | One telling of the world: a series, novel or film, with its own structure levels        |
| Document       | A node in a work: a season or book (container), or an episode or chapter (text)         |
| Scene          | The universal smallest unit, in every medium                                            |
| Entry (entity) | Any named thing in the world, typed by a project-defined template                       |
| Trait          | A system behaviour a type opts into (ages, holders, strength, ranks, maps)              |
| Link           | A typed edge between entries: kinship, relation, teaching, ownership, causal, knowledge |
| Fact           | A time-stamped change to an entry's value (strength, holder, rank, status, location)    |
| Story time     | When something happens in-world, in the project's own calendar                          |
| Narrative time | Where it is revealed, per work (S01E02 sc 3, or Book 1 ch 4)                            |
| As of          | The codex resolved at a point in story time and narrative order                         |
| Canon state    | Canon, tentative or scrapped                                                            |
| Commit         | One atomic set of changes to the world, with a sequence number                          |
| Branch         | A parallel version of the story and its codex (Phase 2)                                 |
| Proposal       | AI-extracted changes waiting for review                                                 |

## 5. Features and requirements

Each requirement lists its phase: **P1** (Phase 1), **P2** (Phase 2), **L** (Later).

### 5.1 Projects and setup

| ID   | Requirement                                                                                                                                                                                                          | Phase |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| PR-1 | Create, rename and archive projects. Each project is fully isolated.                                                                                                                                                 | P1    |
| PR-2 | Start a project from a template: Mythological epic, Epic fantasy, Space opera, or Blank. Templates pre-create entry types, link types, calendars, units and work structures; everything stays editable.              | P1    |
| PR-3 | Custom calendars per project: months, weekdays, eras with direction (BC-style counting), display format. A project can hold several calendars on one shared timeline (e.g. Shire Reckoning and Steward's Reckoning). | P1    |
| PR-4 | Custom units of distance per project (yojana, krosha, league, parsec) with conversions.                                                                                                                              | P1    |
| PR-5 | Project overview: logline, tagline, short and long synopsis, premise, genres, tone, hook, arc, key questions, themes.                                                                                                | P1    |
| PR-6 | Visual references: palette, mood keywords, mood-board images.                                                                                                                                                        | P1    |
| PR-7 | Inspirations: real-world books, films, myths and art, kept out of the world graph.                                                                                                                                   | P1    |
| PR-8 | Save a project's setup as a personal template.                                                                                                                                                                       | L     |

### 5.2 Works and structure

| ID   | Requirement                                                                                                                                         | Phase |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| WK-1 | A project holds any number of works: series, novel, film, trilogy, short, stage, game.                                                              | P1    |
| WK-2 | Each work defines its own structure levels (Season → Episode, Book → Part → Chapter, Act → Sequence).                                               | P1    |
| WK-3 | Navigate works in a sidebar tree, not dropdowns. The open episode or chapter expands to show its scenes.                                            | P1    |
| WK-4 | Add, reorder, rename and delete seasons, episodes, books and chapters.                                                                              | P1    |
| WK-5 | Each episode or chapter has a logline, summary and key events; containers have an arc summary. An episode or chapter guide is generated from these. | P1    |
| WK-6 | A work can pick a structure framework (three-act, Save the Cat, Hero's Journey, Kishōtenketsu).                                                     | P2    |
| WK-7 | Opening an episode moves the codex "as of" to that point in the story; it can be pinned elsewhere.                                                  | P1    |

### 5.3 Editor

| ID    | Requirement                                                                                                                                                                            | Phase |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| ED-1  | Screenplay mode on Fountain plain text, styled live like Beat.                                                                                                                         | P1    |
| ED-2  | Auto-detection: `INT.`/`EXT.`/`INT./EXT.`/`I/E.` become scene headings; caps lines become character cues; `TO:` lines become transitions; `(...)` under a cue becomes a parenthetical. | P1    |
| ED-3  | Enter after a cue goes to dialogue; Enter twice returns to action; Tab cycles element type.                                                                                            | P1    |
| ED-4  | Character autocomplete from the codex, including characters not yet in the script, with alias resolution ("Devavrata" offers Bhishma).                                                 | P1    |
| ED-5  | Prose mode on Markdown with the same engine; scene breaks with `***`.                                                                                                                  | P1    |
| ED-6  | `@Name` and `[[Name]]` mentions link text to codex entries, survive renames, and show a card on click.                                                                                 | P1    |
| ED-7  | Scene outline in the sidebar, built from headings; click to jump. Shows entries in each scene.                                                                                         | P1    |
| ED-8  | Lightweight: no keystroke waits on the network, AI or database. 60-page scripts stay smooth.                                                                                           | P1    |
| ED-9  | Autosave (debounced), a local buffer so nothing typed is lost offline, and a conflict prompt when the same episode changed on another device.                                          | P1    |
| ED-10 | Version history: autosave checkpoints, named snapshots, snapshots before any AI change; restore any version.                                                                           | P1    |
| ED-11 | Focus mode: full-screen sheet, single centred monospace column, faint controls that fade while typing (scenes, ask, check, history, more). Esc exits.                                  | P1    |
| ED-12 | "Add to codex" from selected text in the script.                                                                                                                                       | P1    |
| ED-13 | Annotations: personal notes pinned to text ranges, scenes or entries.                                                                                                                  | P2    |
| ED-14 | Real-time co-writing.                                                                                                                                                                  | L     |

### 5.4 Codex

| ID    | Requirement                                                                                                                                                                                                                                      | Phase                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| CX-1  | Entry types are user-defined per project: name, group (Land, Civilisation, War, custom), icon, fields, traits, optional parent type.                                                                                                             | P1                            |
| CX-2  | Field kinds: text, rich text, number, quantity with unit, story date, choice, multi-choice, yes/no, entry reference, entry list, image, list, composition (e.g. army makeup).                                                                    | P1                            |
| CX-3  | Fields can be marked "changes over time"; changes are recorded as facts.                                                                                                                                                                         | P1                            |
| CX-4  | Traits give types system behaviour: `born` (computed ages), `locatable`, `holdable`, `hasStrength`, `ranked`, `position`, `institution`, `ruleSystem`, `ability`, `event`, `secret`, `setup`, `account`, `transport`, `resource`, `term`, `geo`. | P1 (wiring per feature phase) |
| CX-5  | Every entry has: name, aliases, summary, prominence (main, supporting, minor, background), canon state, first appearance per work, images, tags, connections.                                                                                    | P1                            |
| CX-6  | Codex browser: sidebar of types grouped by Land, Civilisation and War; card grid sorted by prominence (events by year); a detail pane.                                                                                                           | P1                            |
| CX-7  | Character pages: identity, computed age as of the current point, the screenwriting core (role, want, need, wound, lie, voice), holdings and state over time, connections grouped by kind, appearances across every episode and chapter.          | P1                            |
| CX-8  | Dynasty pages: family tree, throne holders over time, history timeline, members born so far.                                                                                                                                                     | P1                            |
| CX-9  | Kingdom and place pages: connection diagram, capital, rulers, geography, rivals, events, royal family.                                                                                                                                           | P1                            |
| CX-10 | New-entry form with a live card preview; fields follow the chosen type; connections added inline.                                                                                                                                                | P1                            |
| CX-11 | Create, edit and delete entry types from the UI.                                                                                                                                                                                                 | P1                            |
| CX-12 | Canon states: canon, tentative, scrapped. Scrapped facts are hidden from checks, AI and default views.                                                                                                                                           | P1                            |
| CX-13 | Merge duplicate entries (e.g. extraction created "Ganga's son" and "Bhishma" separately).                                                                                                                                                        | P1                            |
| CX-14 | Conflicting in-world accounts: links and facts can cite an Account entry (Mushroom vs. Septon Eustace) without contradicting canon.                                                                                                              | P2                            |
| CX-15 | Image generation for cards from their description.                                                                                                                                                                                               | L                             |

### 5.5 Graph, time and views

| ID   | Requirement                                                                                                                                                        | Phase |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| GR-1 | Family trees: one per dynasty, any number per project, with a tree picker. Unborn members fade as of the current point; secret parentage is hidden until revealed. | P1    |
| GR-2 | Relationship web: force or layered layout, filters by link kind, future links shown dotted.                                                                        | P1    |
| GR-3 | Lineage view: one entry and everything connected to it, N hops out.                                                                                                | P1    |
| GR-4 | Timeline in story time or narrative order, per work.                                                                                                               | P1    |
| GR-5 | "As of" control: every card, tree and view resolves to a chosen point in the story.                                                                                | P1    |
| GR-6 | Computed ages from birth dates and the calendar.                                                                                                                   | P1    |
| GR-7 | Storylines: tag scenes to threads (e.g. Karna's thread); see one thread alone; a threads × episodes grid shows threads going cold. POV per prose scene.            | P1    |
| GR-8 | Saved views: named layouts, filters and "as of" points.                                                                                                            | P2    |

### 5.6 AI collaborator

| ID    | Requirement                                                                                                                                                                                                                                          | Phase                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AI-1  | Bring your own key: Anthropic API, OpenAI or OpenRouter. A per-task model choice (extraction, continuity, suggestions, chat, embeddings). Claude.ai or ChatGPT subscriptions are not supported.                                                      | P1                               |
| AI-2  | Keys encrypted at rest; never sent to the browser; only the label and last four characters shown.                                                                                                                                                    | P1                               |
| AI-3  | Extraction on request: run a scene, episode or chapter; the AI proposes new entries, aliases, facts, links and events.                                                                                                                               | P1                               |
| AI-4  | Review screen like a pull request: source text on one side with highlights, proposed changes on the other with confidence; accept, reject or edit each; "accept all ≥ 90%"; commit accepted changes as one commit.                                   | P1                               |
| AI-5  | Identity resolution: mentions are matched to existing entries with candidates and scores ("the Kingslayer" → Jaime 92%); uncertain matches ask instead of guessing.                                                                                  | P1                               |
| AI-6  | Continuity check on request, as plain-code rules first (dead character acts, item not held, name used too early, timeline clash, impossible travel, charges exhausted), then an AI pass for what rules can't see (voice, motivation, unpaid setups). | P1 (rules), P2 (travel, charges) |
| AI-7  | Continuity results appear as underlines with a panel of fixes; editing a flagged passage marks the issue stale rather than re-running.                                                                                                               | P1                               |
| AI-8  | Ask the codex: questions answered from the codex as of the current point, citing the cards used.                                                                                                                                                     | P1                               |
| AI-9  | Writing suggestions on request: weak motivations, unpaid setups, better options.                                                                                                                                                                     | P2                               |
| AI-10 | Cost visible after every run; spend per project and task; optional monthly cap that pauses AI jobs.                                                                                                                                                  | P1                               |
| AI-11 | Off-voice dialogue detection from character voice samples.                                                                                                                                                                                           | L                                |

### 5.7 Epic-scale systems

| ID    | Requirement                                                                                                                                                                                                                                                  | Phase                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| EP-1  | Geography: continents, regions, kingdoms, cities, rivers, mountains, forests, seas, passes and roads as nesting locations with links (borders, flows through, crosses). Sci-fi nesting from galaxy to planet.                                                | P1 (types), P2 (maps)   |
| EP-2  | Maps: upload images, pin locations, draw rivers and roads as lines and regions as areas, with a scale; maps can differ by period. No freehand drawing.                                                                                                       | P2                      |
| EP-3  | Forces and war: armies with composition, strength, commander, allegiance and position over time; battles change strength; a day-by-day war board; checks for fallen commanders leading, destroyed forces reappearing, numbers rising without reinforcements. | P2                      |
| EP-4  | Strategic locations: forts, watchtowers, checkpoints and chokepoints with what they guard, what they see, garrison and holder over time; shown on the war board.                                                                                             | P2                      |
| EP-5  | Rule systems (magic, technology, psionics): source, cost, limits, users, counters; abilities and astras with charges and conditions; uses are events; checks for broken rules, unset-up powers and unpaid costs.                                             | P1 (types), P2 (checks) |
| EP-6  | Weapons and artifacts with holders and properties over time.                                                                                                                                                                                                 | P1                      |
| EP-7  | Positions and succession: offices held over time; computed line of succession; rival claims flagged.                                                                                                                                                         | P2                      |
| EP-8  | Classifications and ranks (Atiratha, Maharatha, Rathi; knighthoods) held over time.                                                                                                                                                                          | P2                      |
| EP-9  | Teaching lineages: gurukuls and academies; taught-by links; a lineage view of how knowledge and astras pass down.                                                                                                                                            | P2                      |
| EP-10 | Travel and transport: travel time from units, map scale, terrain and transport rules (on foot, chariot, ship, dragon, FTL); impossible journeys flagged. Communication speed counts too (news can't outrun the raven).                                       | P2                      |
| EP-11 | Setups, payoffs and mysteries: planted, hinted and paid off, with what the audience knows; unpaid setups flagged.                                                                                                                                            | P2                      |
| EP-12 | Knowledge tracking: secrets as entries and `knows` links over time; flags a character using knowledge they don't have yet.                                                                                                                                   | P2                      |
| EP-13 | Languages and naming: glossary with pronunciation, naming conventions per culture, spelling-variant detection, name generation in a culture's style.                                                                                                         | P2                      |
| EP-14 | Resources and economy: resources produced, controlled and traded by factions over time.                                                                                                                                                                      | L                       |
| EP-15 | Screen-time stats: scenes and lines per character per episode.                                                                                                                                                                                               | L                       |

### 5.8 Branching and adaptation (Phase 2)

| ID   | Requirement                                                                                                                                                | Phase                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| BR-1 | Branches like Git: fork from main ("what if Karna learns the truth in E03?"); the codex branches with the writing.                                         | P2                          |
| BR-2 | Commits and history for the codex: see what changed, by whom (you, the AI, an import), and undo any commit.                                                | P1 (history, undo), P2 (UI) |
| BR-3 | Diff and merge; conflicts shown as story conflicts ("Sunblade destroyed vs. stolen").                                                                      | P2                          |
| BR-4 | Adaptation mode: import the source book as a read-only upstream; the adaptation forks from it.                                                             | P2                          |
| BR-5 | Drift Report: everything cut, merged, renamed, aged up or moved relative to the source.                                                                    | P2                          |
| BR-6 | Impact analysis: deleting or changing an entry (e.g. Maelor) shows the hard fallout from causal links, and the AI proposes forks with cascading timelines. | P2                          |

### 5.9 Planning

| ID   | Requirement                                                                                                                                                                             | Phase |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| PL-1 | Beat board per episode or chapter: cards with title, summary, storylines, entries, framework slot and status (idea, planned, written, cut); a beat links to the scene that realises it. | P2    |

### 5.10 Import and export

| ID   | Requirement                                                                                                                                        | Phase                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| IO-1 | Import existing notes (Markdown, text, docx, PDF) through extraction, reviewed in batches, to bootstrap a codex.                                   | P1                          |
| IO-2 | Import Fountain and Final Draft (.fdx) scripts into the editor.                                                                                    | P1 (Fountain), P2 (FDX)     |
| IO-3 | Export scripts as Fountain, industry-layout PDF and Final Draft (.fdx).                                                                            | P1 (Fountain), L (PDF, FDX) |
| IO-4 | Export prose as Markdown, PDF and docx.                                                                                                            | L                           |
| IO-5 | Scoped lore export: one entry and everything linked to it, in timeline order ("export the Shire"), or by type, faction or era, as Markdown or PDF. | L                           |
| IO-6 | Series bible export as a formatted PDF.                                                                                                            | L                           |
| IO-7 | Full project backup as JSON, on demand and nightly.                                                                                                | P1                          |

### 5.11 Design and experience

| ID   | Requirement                                                                                              | Phase |
| ---- | -------------------------------------------------------------------------------------------------------- | ----- |
| DX-1 | Two themes, switchable: Inkwell (default, monochrome line-art) and Sand (warm). Each has light and dark. | P1    |
| DX-2 | Tone, not lines: regions separated by background tone; no decorative borders.                            | P1    |
| DX-3 | One primary action per screen; everything else quiet.                                                    | P1    |
| DX-4 | Selection in Inkwell inverts to solid ink.                                                               | P1    |
| DX-5 | Works on phone width; the nav becomes a bottom bar. Writing on a phone is supported, not optimised.      | P1    |
| DX-6 | Keyboard access and visible focus everywhere; reduced motion respected.                                  | P1    |

### 5.12 Platform and account

| ID   | Requirement                                                              | Phase |
| ---- | ------------------------------------------------------------------------ | ----- |
| PF-1 | Single-user sign-in with GitHub, allowlisted to one account.             | P1    |
| PF-2 | Cloud-hosted; the same data on every device.                             | P1    |
| PF-3 | Collaborators with roles.                                                | L     |
| PF-4 | Offline-first writing with later sync (beyond the local buffer in ED-9). | L     |

## 6. Phases

### Phase 1: core loop

**Goal:** a tool good enough to write Aryavarta in.

Build order:

1. Skeleton: monorepo, auth, all collections and indexes, the versioned commit path, jobs worker, design tokens, project list.
2. Editor: Fountain and Markdown, Beat behaviours, works navigator, autosave, local buffer, version history, focus mode.
3. Codex: templates, custom types and traits, cards, new-entry form, `@` mentions wired to the editor, dynasty and kingdom pages.
4. Graph and time: links, facts, "as of", family trees, relationship web, timeline, computed ages, storylines.
5. Jobs and AI: BYOK settings, extraction and review, continuity checks (rule pass and AI pass), Ask the codex, cost tracking.
6. Import: existing Aryavarta notes through extraction.

**Done when:**

- [ ] Aryavarta S01E02 is written in Epic Writer, in screenplay mode, with Beat-level speed.
- [ ] Extraction of S01E02 produces proposals that are mostly right, and committing them updates the codex correctly.
- [ ] A continuity check catches at least one real mistake in the draft.
- [ ] The codex holds Aryavarta's existing notes, imported through extraction.
- [ ] The Kuru family tree, Devavrata's card and the Kuru dynasty page are correct "as of" any episode.
- [ ] Nothing typed has been lost across devices or a dropped connection.
- [ ] A nightly JSON export exists.

### Phase 2: branching and epic systems

Split into two tracks so neither stalls the other:

- **Track A, story as code:** branches, the branch-aware codex, diff, merge, adaptation upstream, Drift Report, impact analysis and forks, beat board, saved views, writing suggestions, annotations.
- **Track B, epic systems:** maps, forces and the war board, strategic locations, rule-system enforcement, positions and succession, ranks, teaching lineages, travel and transport checks, setups and payoffs, knowledge tracking, languages and naming, conflicting accounts.

Real friction from writing Aryavarta decides which items go first.

### Later

PDF and Final Draft export, prose export, scoped lore and series bible exports, image generation from cards, resources and economy, screen-time stats, voice samples and off-voice detection, offline-first sync, real-time co-writing, collaborators, personal templates, and Neo4j if Mongo hits its limits.

## 7. Non-goals

- A general-purpose word processor or note app.
- Map drawing tools; maps are uploaded images with features on top.
- Bundled AI billing; users bring their own keys.
- AI that writes scenes unprompted or edits the codex without review.
- A public product launch (until Phase 1 proves the tool on Aryavarta).

## 8. Open questions

- [ ] Hosting choice between Railway and Fly.io, and the monthly cost for one user.
- [ ] Trademark check on "Epic Writer" before any public release.
- [ ] How "who knows what" is entered without manual bookkeeping (extraction proposing `knows` links is the current plan).
- [ ] Final display and body fonts for both themes.
