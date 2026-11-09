# Epic Writer data model

MongoDB, 26 collections, locked for all phases. Features ship in phases; the schema doesn't. Ask before changing anything here.

## Conventions

**Versioned collections (11):** `calendars, entityTypes, linkTypes, entities, links, facts, works, documents, storylines, beats, maps`.

Every versioned row carries this envelope (not repeated below):

| Field         | Type             | Notes                                                               |
| ------------- | ---------------- | ------------------------------------------------------------------- |
| _id           | ObjectId         | This row version only                                               |
| key           | string (UUID v7) | Stable identity across versions and branches. All references use it |
| projectId     | ObjectId         |                                                                     |
| branchId      | ObjectId         | Branch this version was written on                                  |
| seq           | number           | Commit that created this version                                    |
| supersededSeq | number \| null   | Set when a newer version replaces it on the same branch             |
| isHead        | boolean          | Current version on its branch                                       |
| deleted       | boolean          | Tombstone                                                           |
| createdAt     | Date             |                                                                     |

Plain collections carry `createdAt`/`updatedAt`; those holding branch-specific data also carry `projectId` and `branchId`.

**Shared shapes**

- `storyTime`: `{ start: int, end: int | null, precision: 'day'|'month'|'year'|'era'|'unknown' }`. Day index from the project epoch; negative allowed.
- `narrativeRef`: `{ workKey, documentKey, sceneKey, order }`. `order` = zero-padded path, e.g. `0001.0002.0014`.
- `canonState`: `'canon' | 'tentative' | 'scrapped'`.
- `origin`: `'user' | 'ai' | 'import'`, with optional `proposalId`.
- `overview`: `{ logline, tagline, synopsisShort, synopsisLong, premise, genres[], tone, hook, arc, keyQuestions[], themeKeys[] }`.
- `visual`: `{ palette: string[], moodKeywords: string[], moodboardAssetIds: ObjectId[] }`.
- `inspirations`: `[{ title, kind: 'book'|'film'|'series'|'myth'|'art'|'music'|'other', creator, note, url }]`.

**Text markers** in stored text: scene `[[@s:<key>]]` (Markdown `<!-- s:<key> -->`), mention `[[@e:<key>|Display Name]]`.

## System

**users** (plain): `email, name, githubLogin, aiKeys[{ provider, encryptedKey, iv, tag, label, last4 }], preferences{ skin, theme, editorFont, defaultTemplate }`.

**projects** (plain): `ownerId, members[{ userId, role }], name, description, templateKey, mainBranchId, seqCounter, defaultCalendarKey, units[{ key, name, abbr, toBase }], typeGroups[{ key, name, order }], aiSettings{ provider, models{ extraction, continuity, suggestions, chat, embedding, classification }, autoRun:false, monthlyCapMicros }, overview, visual, inspirations, archivedAt: Date|null`.

**templates** (plain): `key, name, description, ownerId|null (null = built-in), entityTypes[], linkTypes[], workStructures[{ key, name, medium, levels[] }], structureFrameworks[{ key, name, slots[{ key, label, position }] }], calendarPreset, units[]`.

**calendars** (versioned): `name, epochOffset, months[{ name, days }], daysPerWeek, weekdayNames[], eras[{ name, abbr, startDay, direction: 1|-1 }], displayFormat`.

**branches** (plain): `projectId, name, kind: 'main'|'draft'|'source'|'adaptation', parentBranchId|null, forkSeq|null, headSeq, readOnly, status: 'active'|'merged'|'archived'`. Every project gets a real `main` record at creation.

**commits** (plain): `projectId, branchId, seq (unique per project), parentSeqs[], message, author{ kind: 'user'|'ai'|'import', userId, proposalId }, auto, stats{ entities, links, facts, documents, other }`.

**jobs** (plain): `projectId, branchId, type: 'extract'|'continuity'|'ask'|'embed'|'import'|'export'|'merge-preview'|'noop', status: 'queued'|'running'|'done'|'failed'|'cancelled', attempts, lockedBy, lockedUntil, runAfter, progress{ done, total }, input{}, output{}, costMicros, error`.

## World (all versioned)

**entityTypes**: `name, pluralName, description, icon, color, group, parentTypeKey, traits[], fields[{ key, label, kind, options, required, timeVarying, refTypeKeys[], ai }], order`.

- Field kinds: `text, richtext, number, quantity, date (story time), enum, multiEnum, boolean, entityRef, entityRefList, image, list, composition, narrativeRef, narrativeRefList`. A `narrativeRef` value is `{ workKey, documentKey, sceneKey, order, label? }` (`sceneKey` null for a whole document). A reference to a container (season, book, part) stores its last scene's order, so it never reveals early. Before it's linked, an item keeps only `label`, with the other four null, and its card shows "needs a scene link".
- `ai`: `'extract'` (extraction may fill it), `'read'` (shown to the AI, never written by it; the default for custom fields) or `'hidden'` (never in any prompt or chunk). Rows saved before `ai` existed resolve through `fieldAi`.
- Traits: `born, locatable, holdable, hasStrength, ranked, position, institution, ruleSystem, ability, event, secret, setup, account, transport, resource, term, geo`.

**linkTypes**: `label, inverseLabel, kind: 'kinship'|'relation'|'causal'|'ownership'|'location'|'teaching'|'membership'|'knowledge'|'narrative', symmetric, fromTypeKeys[], toTypeKeys[], fields[]`.

**entities**: `typeKey, name, slug (unique per project+branch among heads), aliases[], summary, prominence: 'main'|'supporting'|'minor'|'background', fields{} (validated against the type), images[{ assetId, caption, primary }], canonState, storyTime, firstAppearances[narrativeRef], tags[], origin, proposalId`.

**links**: `fromKey, toKey, typeKey, kind (copied from link type), fields{}, storyTime, narrativeRefs[], accountKey, canonState, weight, note, sourceRef, origin, proposalId`.

**facts**: `entityKey, field (a timeVarying field: strength, composition, status, rankKey, locationKey, holderKey, charges, ...), value, storyTime, narrativeRefs[], causeKey (event entity), accountKey, canonState, sourceRef, origin, proposalId`.

## Writing

**works** (versioned): `name, medium: 'novel'|'series'|'film'|'trilogy'|'short'|'stage'|'game'|'other', levels[{ key, singular, plural, numbering, labelFormat }], defaultContentType, status: 'planning'|'drafting'|'revising'|'done', order, overview, visual, inspirations, frameworkKey`.

**documents** (versioned): `workKey, parentKey|null, levelKey, kind: 'container'|'text', contentType: 'screenplay'|'prose'|'treatment'|'outline'|'note', format: 'fountain'|'markdown', title, number, orderPath, storyTime, logline, summary, arcSummary, keyEventKeys[]`.

**documentVersions** (plain): `projectId, branchId, documentKey, kind: 'working'|'snapshot', version (working copy, for optimistic saves), text, seq|null, reason: 'autosave-checkpoint'|'manual'|'before-ai'|'commit'|'import', label, textHash, wordCount, pageCount`. One `working` row per document per branch.

**scenes** (plain, derived on save): `projectId, branchId, sceneKey, workKey, documentKey, order, heading, range{ from, to }, locationKey, storyTime, storylineKeys[], povEntityKey, entityKeys[], speakingEntityKeys[], wordCount, estDuration`.

**storylines** (versioned): `name, color, workKey|null, focusEntityKeys[], description`.

**beats** (versioned): `workKey, documentKey, order, title, summary, storylineKeys[], entityKeys[], structureTag, status: 'idea'|'planned'|'written'|'cut', sceneKey`.

**annotations** (plain): `projectId, branchId, target{ kind: 'document'|'entity'|'scene', key, range }, body, status: 'open'|'resolved'`.

## AI (plain)

**proposals**: `projectId, branchId, jobId, source{ kind: 'document'|'import', documentKey, range, documentVersionId }, status: 'pending'|'partially-applied'|'applied'|'rejected', changes[{ op, payload, confidence, matchCandidates[{ key, score }], status, flags[] }], warnings[], appliedSeq, model, tokensIn, tokensOut, costMicros`.

- Flags: `quote-not-found` (confidence set to 0), `value-not-in-choices` (kept as written; can't be accepted until edited), `no-anchor` (a fact with no scene and no stated date).
- Change ops: `createEntity, updateField, addAlias, mergeEntities, createLink, endLink, addFact, createScene, tagScene`.

**continuityIssues**: `projectId, branchId, workKey, documentKey, sceneKey, range, rule, severity: 'info'|'warning'|'error', message, relatedKeys[], checkedSeq, checkedTextHash, status: 'open'|'dismissed'|'fixed'|'stale'`.

- Rules: `dead-character-acts, item-not-held, rule-violation, charges-exhausted, impossible-travel, timeline-clash, contradicts-canon, knowledge-leak, unpaid-setup, rank-mismatch`.

**chunks**: `projectId, branchId, sourceKind: 'entity'|'scene'|'document'|'import', sourceKey, text, embedding number[], embeddingModel, hash`. Entity chunks use `sourceKey` = `<entityKey>#<fieldKey>#<n>`.

**aiUsage**: `projectId, jobId, task: 'extraction'|'continuity'|'suggestion'|'chat'|'embedding', provider, model, promptVersion, tokensIn, tokensOut, costMicros, pass: 'mentions'|'fields', promptChars, at`.

## Files and views

**assets** (plain): `projectId, kind: 'image'|'map'|'import'|'export', storageKey, mime, size, width, height, origin: 'upload'|'generated'|'export'`.

**maps** (versioned): `assetId, name, storyTime, scale{ unitKey, unitsPerPixel }, features[{ entityKey, geometry{ type: 'point'|'line'|'polygon', coords }, storyTime }]`.

**savedViews** (plain): `projectId, branchId, kind: 'graph'|'familyTree'|'lineage'|'timeline'|'map'|'cards'|'warBoard'|'threadsGrid'|'beatBoard', name, filters{}, asOf{ storyTime, workKey, narrativeOrder }, layout{}`.

## Indexes

| Collection       | Index                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| every versioned  | `{ projectId, key, branchId, seq }` unique                                                                       |
| every versioned  | `{ projectId, branchId, isHead }` partial on `isHead: true`                                                      |
| entities         | `{ projectId, branchId, typeKey, name }` partial on head                                                         |
| entities         | `{ projectId, branchId, slug }` unique, partial on `isHead: true, deleted: false`                                |
| entities         | text on `name, aliases, summary`                                                                                 |
| entities         | wildcard `fields.$**`                                                                                            |
| links            | `{ projectId, branchId, fromKey, kind }` partial on head                                                         |
| links            | `{ projectId, branchId, toKey, kind }` partial on head                                                           |
| facts            | `{ projectId, branchId, entityKey, field, 'storyTime.start' }` partial on head                                   |
| documents        | `{ projectId, branchId, workKey, parentKey, number }` partial on head                                            |
| documentVersions | `{ documentKey, branchId, kind, createdAt }`; unique partial `{ documentKey, branchId }` where `kind: 'working'` |
| scenes           | `{ projectId, branchId, workKey, order }`; `{ projectId, branchId, entityKeys }`                                 |
| beats            | `{ projectId, branchId, workKey, documentKey, order }` partial on head                                           |
| commits          | `{ projectId, seq }` unique; `{ projectId, branchId, seq }`                                                      |
| branches         | `{ projectId, name }` unique                                                                                     |
| proposals        | `{ projectId, branchId, status }`                                                                                |
| continuityIssues | `{ projectId, branchId, documentKey, status }`                                                                   |
| jobs             | `{ status, runAfter }`; `{ projectId, status, type }`                                                            |
| aiUsage          | `{ projectId, at }`                                                                                              |
| users            | `{ email }` unique; `{ githubLogin }` unique                                                                     |
| chunks           | Atlas vector index on `embedding` filtered by `projectId, branchId` (Atlas only; skipped locally)                |

## Reads

- **Current state on main:** `{ projectId, branchId: main, isHead: true, deleted: false }`.
- **At a past seq S:** `seq <= S` and (`supersededSeq` is null or `> S`), not deleted.
- **On a branch (Phase 2):** walk branch → parent at `forkSeq` → ...; per key, the nearest branch's version wins; tombstones hide a key.
- **Fact as of story time T:** facts for `entityKey, field`, head, not scrapped, `storyTime.start <= T`, sort `storyTime.start` desc, limit 1.
