import { ObjectId } from 'mongodb';
import { NotFound, openProject, type ProjectContext, type VersionSummary } from '@epic/core';
import type {
  DocumentDoc,
  EntityDoc,
  EntityTypeDoc,
  FactDoc,
  LinkDoc,
  UserDoc,
  WorkDoc,
} from '@epic/db';
import type {
  DocumentDto,
  EntityDto,
  EntityTypeDto,
  FactDto,
  LinkDto,
  VersionDto,
  WorkDto,
} from '@epic/schemas/api';
import { getAppDb } from './server';

/** Resolves a project id from the URL for this user; malformed and foreign ids are both NotFound. */
export function projectFor(projectId: string, user: UserDoc): Promise<ProjectContext> {
  if (!ObjectId.isValid(projectId)) throw new NotFound('Project not found');
  return openProject(getAppDb(), new ObjectId(projectId), user._id);
}

export const toWorkDto = (w: WorkDoc): WorkDto => ({
  key: w.key,
  name: w.name,
  medium: w.medium,
  levels: w.levels.map(({ key, singular, plural }) => ({ key, singular, plural })),
});

export const toDocumentDto = (d: DocumentDoc): DocumentDto => ({
  key: d.key,
  workKey: d.workKey,
  parentKey: d.parentKey,
  levelKey: d.levelKey,
  kind: d.kind,
  format: d.format,
  title: d.title,
  number: d.number,
  orderPath: d.orderPath,
  storyTime: d.storyTime,
  logline: d.logline,
  summary: d.summary,
  arcSummary: d.arcSummary,
  keyEventKeys: d.keyEventKeys,
});

export const toVersionDto = (v: VersionSummary): VersionDto => ({
  ...v,
  createdAt: v.createdAt.toISOString(),
});

export const toEntityTypeDto = (t: EntityTypeDoc): EntityTypeDto => ({
  key: t.key,
  name: t.name,
  pluralName: t.pluralName,
  icon: t.icon,
  color: t.color as EntityTypeDto['color'],
  group: t.group,
  parentTypeKey: t.parentTypeKey,
  traits: t.traits,
  fields: t.fields,
  order: t.order,
});

export const toEntityDto = (e: EntityDoc): EntityDto => ({
  key: e.key,
  slug: e.slug,
  typeKey: e.typeKey,
  name: e.name,
  aliases: e.aliases,
  summary: e.summary,
  prominence: e.prominence,
  canonState: e.canonState,
  tags: e.tags,
  fields: e.fields,
  updatedAt: e.createdAt.toISOString(),
});

export const toLinkDto = (l: LinkDoc): LinkDto => ({
  key: l.key,
  typeKey: l.typeKey,
  kind: l.kind,
  fromKey: l.fromKey,
  toKey: l.toKey,
  storyTime: l.storyTime,
  narrativeRefs: l.narrativeRefs,
  canonState: l.canonState,
  note: l.note,
});

export const toFactDto = (f: FactDoc): FactDto => ({
  key: f.key,
  entityKey: f.entityKey,
  field: f.field,
  value: f.value,
  storyTime: f.storyTime,
  narrativeRefs: f.narrativeRefs,
  causeKey: f.causeKey,
  canonState: f.canonState,
});
