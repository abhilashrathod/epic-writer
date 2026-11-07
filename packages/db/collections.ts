import type { ObjectId } from 'mongodb';

// Types mirror docs/data-model.md exactly. Change that doc first, then this file.

// ---------- Envelopes ----------

export interface VersionedEnvelope {
  _id: ObjectId;
  key: string;
  projectId: ObjectId;
  branchId: ObjectId;
  seq: number;
  supersededSeq: number | null;
  isHead: boolean;
  deleted: boolean;
  createdAt: Date;
}

export type Versioned<T> = VersionedEnvelope & T;

export interface PlainEnvelope {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type Plain<T> = PlainEnvelope & T;

/** Plain records holding branch-specific data. */
export type BranchScoped<T> = Plain<{ projectId: ObjectId; branchId: ObjectId } & T>;

// ---------- Shared shapes ----------

export type Precision = 'day' | 'month' | 'year' | 'era' | 'unknown';
export interface StoryTime {
  start: number;
  end: number | null;
  precision: Precision;
}

export interface NarrativeRef {
  workKey: string;
  documentKey: string;
  sceneKey: string;
  order: string;
}

export type CanonState = 'canon' | 'tentative' | 'scrapped';
export type Origin = 'user' | 'ai' | 'import';

export interface Overview {
  logline: string;
  tagline: string;
  synopsisShort: string;
  synopsisLong: string;
  premise: string;
  genres: string[];
  tone: string;
  hook: string;
  arc: string;
  keyQuestions: string[];
  themeKeys: string[];
}

export interface Visual {
  palette: string[];
  moodKeywords: string[];
  moodboardAssetIds: ObjectId[];
}

export interface Inspiration {
  title: string;
  kind: 'book' | 'film' | 'series' | 'myth' | 'art' | 'music' | 'other';
  creator: string;
  note: string;
  url: string;
}

export interface TextRange {
  from: number;
  to: number;
}

export interface Unit {
  key: string;
  name: string;
  abbr: string;
  toBase: number;
}

// ---------- System ----------

export interface AiKey {
  provider: string;
  encryptedKey: string;
  iv: string;
  tag: string;
  label: string;
  last4: string;
}

export type Skin = 'ink' | 'sand';
export type Theme = 'light' | 'dark' | 'system';

export type UserDoc = Plain<{
  email: string;
  name: string;
  githubLogin: string;
  aiKeys: AiKey[];
  preferences: { skin: Skin; theme: Theme; editorFont: string; defaultTemplate: string };
}>;

export type ProjectDoc = Plain<{
  ownerId: ObjectId;
  members: { userId: ObjectId; role: string }[];
  name: string;
  description: string;
  templateKey: string;
  mainBranchId: ObjectId;
  seqCounter: number;
  defaultCalendarKey: string;
  units: Unit[];
  typeGroups: { key: string; name: string; order: number }[];
  aiSettings: {
    provider: string;
    models: {
      extraction: string;
      continuity: string;
      suggestions: string;
      chat: string;
      embedding: string;
    };
    autoRun: false;
    monthlyCapMicros: number;
  };
  overview: Overview;
  visual: Visual;
  inspirations: Inspiration[];
}>;

export type TemplateDoc = Plain<{
  key: string;
  name: string;
  description: string;
  ownerId: ObjectId | null;
  entityTypes: EntityTypeBody[];
  linkTypes: LinkTypeBody[];
  workStructures: { key: string; name: string; medium: WorkMedium; levels: WorkLevel[] }[];
  structureFrameworks: {
    key: string;
    name: string;
    slots: { key: string; label: string; position: number }[];
  }[];
  calendarPreset: CalendarBody;
  units: Unit[];
}>;

export interface CalendarBody {
  name: string;
  epochOffset: number;
  months: { name: string; days: number }[];
  daysPerWeek: number;
  weekdayNames: string[];
  eras: { name: string; abbr: string; startDay: number; direction: 1 | -1 }[];
  displayFormat: string;
}
export type CalendarDoc = Versioned<CalendarBody>;

export type BranchDoc = Plain<{
  projectId: ObjectId;
  name: string;
  kind: 'main' | 'draft' | 'source' | 'adaptation';
  parentBranchId: ObjectId | null;
  forkSeq: number | null;
  headSeq: number;
  readOnly: boolean;
  status: 'active' | 'merged' | 'archived';
}>;

export type AuthorKind = 'user' | 'ai' | 'import';
export interface CommitStats {
  entities: number;
  links: number;
  facts: number;
  documents: number;
  other: number;
}

export type CommitDoc = BranchScoped<{
  seq: number;
  parentSeqs: number[];
  message: string;
  author: { kind: AuthorKind; userId?: ObjectId; proposalId?: ObjectId };
  auto: boolean;
  stats: CommitStats;
}>;

export type JobType =
  'extract' | 'continuity' | 'ask' | 'embed' | 'import' | 'export' | 'merge-preview' | 'noop';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type JobDoc = BranchScoped<{
  type: JobType;
  status: JobStatus;
  attempts: number;
  lockedBy: string | null;
  lockedUntil: Date | null;
  runAfter: Date;
  progress: { done: number; total: number };
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  costMicros: number;
  error: string | null;
}>;

// ---------- World ----------

export type FieldKind =
  | 'text'
  | 'richtext'
  | 'number'
  | 'quantity'
  | 'date'
  | 'enum'
  | 'multiEnum'
  | 'boolean'
  | 'entityRef'
  | 'entityRefList'
  | 'image'
  | 'list'
  | 'composition';

export type Trait =
  | 'born'
  | 'locatable'
  | 'holdable'
  | 'hasStrength'
  | 'ranked'
  | 'position'
  | 'institution'
  | 'ruleSystem'
  | 'ability'
  | 'event'
  | 'secret'
  | 'setup'
  | 'account'
  | 'transport'
  | 'resource'
  | 'term'
  | 'geo';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options: string[];
  required: boolean;
  timeVarying: boolean;
  refTypeKeys: string[];
}

export interface EntityTypeBody {
  name: string;
  pluralName: string;
  icon: string;
  color: string;
  group: string;
  parentTypeKey: string | null;
  traits: Trait[];
  fields: FieldDef[];
  order: number;
}
export type EntityTypeDoc = Versioned<EntityTypeBody>;

export type LinkKind =
  | 'kinship'
  | 'relation'
  | 'causal'
  | 'ownership'
  | 'location'
  | 'teaching'
  | 'membership'
  | 'knowledge'
  | 'narrative';

export interface LinkTypeBody {
  label: string;
  inverseLabel: string;
  kind: LinkKind;
  symmetric: boolean;
  fromTypeKeys: string[];
  toTypeKeys: string[];
  fields: FieldDef[];
}
export type LinkTypeDoc = Versioned<LinkTypeBody>;

export type EntityDoc = Versioned<{
  typeKey: string;
  name: string;
  slug: string;
  aliases: string[];
  summary: string;
  prominence: 'main' | 'supporting' | 'minor' | 'background';
  fields: Record<string, unknown>;
  images: { assetId: ObjectId; caption: string; primary: boolean }[];
  canonState: CanonState;
  storyTime: StoryTime | null;
  firstAppearances: NarrativeRef[];
  tags: string[];
  origin: Origin;
  proposalId: ObjectId | null;
}>;

export type LinkDoc = Versioned<{
  fromKey: string;
  toKey: string;
  typeKey: string;
  kind: LinkKind;
  fields: Record<string, unknown>;
  storyTime: StoryTime | null;
  narrativeRefs: NarrativeRef[];
  accountKey: string | null;
  canonState: CanonState;
  weight: number;
  note: string;
  sourceRef: NarrativeRef | null;
  origin: Origin;
  proposalId: ObjectId | null;
}>;

export type FactDoc = Versioned<{
  entityKey: string;
  field: string;
  value: unknown;
  storyTime: StoryTime;
  narrativeRefs: NarrativeRef[];
  causeKey: string | null;
  accountKey: string | null;
  canonState: CanonState;
  sourceRef: NarrativeRef | null;
  origin: Origin;
  proposalId: ObjectId | null;
}>;

// ---------- Writing ----------

export type WorkMedium =
  'novel' | 'series' | 'film' | 'trilogy' | 'short' | 'stage' | 'game' | 'other';

export interface WorkLevel {
  key: string;
  singular: string;
  plural: string;
  numbering: string;
  labelFormat: string;
}

export type ContentType = 'screenplay' | 'prose' | 'treatment' | 'outline' | 'note';

export type WorkDoc = Versioned<{
  name: string;
  medium: WorkMedium;
  levels: WorkLevel[];
  defaultContentType: ContentType;
  status: 'planning' | 'drafting' | 'revising' | 'done';
  order: number;
  overview: Overview;
  visual: Visual;
  inspirations: Inspiration[];
  frameworkKey: string | null;
}>;

export type DocumentDoc = Versioned<{
  workKey: string;
  parentKey: string | null;
  levelKey: string;
  kind: 'container' | 'text';
  contentType: ContentType;
  format: 'fountain' | 'markdown';
  title: string;
  number: number;
  orderPath: string;
  storyTime: StoryTime | null;
  logline: string;
  summary: string;
  arcSummary: string;
  keyEventKeys: string[];
}>;

export type DocumentVersionDoc = BranchScoped<{
  documentKey: string;
  kind: 'working' | 'snapshot';
  version: number;
  text: string;
  seq: number | null;
  reason: 'autosave-checkpoint' | 'manual' | 'before-ai' | 'commit' | 'import';
  label: string;
  textHash: string;
  wordCount: number;
  pageCount: number;
}>;

export type SceneDoc = BranchScoped<{
  sceneKey: string;
  workKey: string;
  documentKey: string;
  order: string;
  heading: string;
  range: TextRange;
  locationKey: string | null;
  storyTime: StoryTime | null;
  storylineKeys: string[];
  povEntityKey: string | null;
  entityKeys: string[];
  speakingEntityKeys: string[];
  wordCount: number;
  estDuration: number;
}>;

export type StorylineDoc = Versioned<{
  name: string;
  color: string;
  workKey: string | null;
  focusEntityKeys: string[];
  description: string;
}>;

export type BeatDoc = Versioned<{
  workKey: string;
  documentKey: string;
  order: string;
  title: string;
  summary: string;
  storylineKeys: string[];
  entityKeys: string[];
  structureTag: string;
  status: 'idea' | 'planned' | 'written' | 'cut';
  sceneKey: string | null;
}>;

export type AnnotationDoc = BranchScoped<{
  target: { kind: 'document' | 'entity' | 'scene'; key: string; range: TextRange | null };
  body: string;
  status: 'open' | 'resolved';
}>;

// ---------- AI ----------

export type ProposalOp =
  | 'createEntity'
  | 'updateField'
  | 'addAlias'
  | 'mergeEntities'
  | 'createLink'
  | 'endLink'
  | 'addFact'
  | 'createScene'
  | 'tagScene';

export type ProposalDoc = BranchScoped<{
  jobId: ObjectId;
  source: {
    kind: 'document' | 'import';
    documentKey: string | null;
    range: TextRange | null;
    documentVersionId: ObjectId | null;
  };
  status: 'pending' | 'partially-applied' | 'applied' | 'rejected';
  changes: {
    op: ProposalOp;
    payload: Record<string, unknown>;
    confidence: number;
    matchCandidates: { key: string; score: number }[];
    status: string;
  }[];
  appliedSeq: number | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
}>;

export type ContinuityRule =
  | 'dead-character-acts'
  | 'item-not-held'
  | 'rule-violation'
  | 'charges-exhausted'
  | 'impossible-travel'
  | 'timeline-clash'
  | 'contradicts-canon'
  | 'knowledge-leak'
  | 'unpaid-setup'
  | 'rank-mismatch';

export type ContinuityIssueDoc = BranchScoped<{
  workKey: string;
  documentKey: string;
  sceneKey: string | null;
  range: TextRange | null;
  rule: ContinuityRule;
  severity: 'info' | 'warning' | 'error';
  message: string;
  relatedKeys: string[];
  checkedSeq: number;
  checkedTextHash: string;
  status: 'open' | 'dismissed' | 'fixed' | 'stale';
}>;

export type ChunkDoc = BranchScoped<{
  sourceKind: 'entity' | 'scene' | 'document' | 'import';
  sourceKey: string;
  text: string;
  embedding: number[];
  embeddingModel: string;
  hash: string;
}>;

export type AiUsageDoc = Plain<{
  projectId: ObjectId;
  jobId: ObjectId | null;
  task: 'extraction' | 'continuity' | 'suggestion' | 'chat' | 'embedding';
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  at: Date;
}>;

// ---------- Files and views ----------

export type AssetDoc = Plain<{
  projectId: ObjectId;
  kind: 'image' | 'map' | 'import' | 'export';
  storageKey: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  origin: 'upload' | 'generated' | 'export';
}>;

export type MapDoc = Versioned<{
  assetId: ObjectId;
  name: string;
  storyTime: StoryTime | null;
  scale: { unitKey: string; unitsPerPixel: number };
  features: {
    entityKey: string;
    geometry: { type: 'point' | 'line' | 'polygon'; coords: number[] | number[][] };
    storyTime: StoryTime | null;
  }[];
}>;

export type SavedViewDoc = BranchScoped<{
  kind:
    | 'graph'
    | 'familyTree'
    | 'lineage'
    | 'timeline'
    | 'map'
    | 'cards'
    | 'warBoard'
    | 'threadsGrid'
    | 'beatBoard';
  name: string;
  filters: Record<string, unknown>;
  asOf: { storyTime: number | null; workKey: string | null; narrativeOrder: string | null };
  layout: Record<string, unknown>;
}>;

// ---------- Registry ----------

export interface VersionedCollections {
  calendars: CalendarDoc;
  entityTypes: EntityTypeDoc;
  linkTypes: LinkTypeDoc;
  entities: EntityDoc;
  links: LinkDoc;
  facts: FactDoc;
  works: WorkDoc;
  documents: DocumentDoc;
  storylines: StorylineDoc;
  beats: BeatDoc;
  maps: MapDoc;
}

export interface PlainCollections {
  users: UserDoc;
  projects: ProjectDoc;
  templates: TemplateDoc;
  branches: BranchDoc;
  commits: CommitDoc;
  jobs: JobDoc;
  documentVersions: DocumentVersionDoc;
  scenes: SceneDoc;
  annotations: AnnotationDoc;
  proposals: ProposalDoc;
  continuityIssues: ContinuityIssueDoc;
  chunks: ChunkDoc;
  aiUsage: AiUsageDoc;
  assets: AssetDoc;
  savedViews: SavedViewDoc;
}

export type CollectionDocs = VersionedCollections & PlainCollections;
export type VersionedCollection = keyof VersionedCollections;
export type CollectionName = keyof CollectionDocs;

export const VERSIONED_COLLECTIONS = [
  'calendars',
  'entityTypes',
  'linkTypes',
  'entities',
  'links',
  'facts',
  'works',
  'documents',
  'storylines',
  'beats',
  'maps',
] as const satisfies readonly VersionedCollection[];

export const PLAIN_COLLECTIONS = [
  'users',
  'projects',
  'templates',
  'branches',
  'commits',
  'jobs',
  'documentVersions',
  'scenes',
  'annotations',
  'proposals',
  'continuityIssues',
  'chunks',
  'aiUsage',
  'assets',
  'savedViews',
] as const satisfies readonly (keyof PlainCollections)[];

export const ALL_COLLECTIONS: readonly CollectionName[] = [
  ...VERSIONED_COLLECTIONS,
  ...PLAIN_COLLECTIONS,
];

export function isVersionedCollection(name: string): name is VersionedCollection {
  return (VERSIONED_COLLECTIONS as readonly string[]).includes(name);
}

/** Body of a versioned doc: everything except the envelope. */
export type VersionedBody<C extends VersionedCollection> = Omit<
  VersionedCollections[C],
  keyof VersionedEnvelope
>;
