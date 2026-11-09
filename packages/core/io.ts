import { BSON, type Db, type Document, type ObjectId } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import {
  backups,
  projects,
  readHeadByKey,
  PROJECT_COLLECTIONS,
  type ProjectCollection,
  type ProjectDoc,
} from '@epic/db';
import { assignSceneKeys, splitTitlePage, stripMarkers } from '@epic/fountain';
import { Conflict, Invalid, NotFound } from './errors';
import { saveWorkingText } from './save';
import { createDocument, getWorkingText, type ProjectContext } from './works';

const MAX_TITLE = 200;

/** Strips a byte-order mark and turns CRLF/CR line endings into LF. */
export function normaliseText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * Imports a Fountain file as a new script under `parentKey` (IO-2). The title page, if any, names
 * the document and is dropped from the text; otherwise the file name does. Scene keys are assigned
 * here so scene rows exist before the script is first opened.
 */
export async function importFountain(
  db: Db,
  ctx: ProjectContext,
  input: { workKey: string; parentKey: string | null; fileName: string; text: string },
): Promise<string> {
  const work = await readHeadByKey(db, 'works', ctx.scope, input.workKey);
  if (!work) throw new NotFound('Work not found');
  if (work.defaultContentType !== 'screenplay')
    throw new Invalid(`"${work.name}" holds prose. Import Fountain into a screenplay work.`);
  const parent = input.parentKey
    ? await readHeadByKey(db, 'documents', ctx.scope, input.parentKey)
    : null;
  if (input.parentKey && !parent) throw new NotFound('Parent not found in this work');
  // Only the bottom level holds text; checked before creating so a bad target leaves nothing behind.
  const depth = parent ? work.levels.findIndex((l) => l.key === parent.levelKey) + 1 : 0;
  if (depth !== work.levels.length - 1) {
    const textLevel = work.levels[work.levels.length - 1]?.singular.toLowerCase() ?? 'script';
    throw new Invalid(`Import a script where a ${textLevel} goes`);
  }

  const { title, body } = splitTitlePage(normaliseText(input.text));
  const fallback = input.fileName.replace(/\.[^.]*$/, '').trim();
  const key = await createDocument(db, ctx, {
    workKey: work.key,
    parentKey: parent?.key ?? null,
    title: (title ?? fallback).slice(0, MAX_TITLE),
  });
  await saveWorkingText(db, ctx, {
    documentKey: key,
    text: assignSceneKeys(body, 'fountain', uuidv7),
    baseVersion: 0,
  });
  return key;
}

/** A file name safe on every OS, from a document title. */
export function safeFileName(title: string): string {
  return (
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'document'
  );
}

/**
 * A script as Fountain (IO-3) or a chapter as Markdown, with identity markers stripped. Fountain
 * files start with a title page, so they import back under the same title.
 */
export async function exportDocumentText(
  db: Db,
  ctx: ProjectContext,
  key: string,
): Promise<{ fileName: string; text: string }> {
  const { document, text } = await getWorkingText(db, ctx, key);
  const body = stripMarkers(text);
  const name = safeFileName(document.title);
  return document.format === 'fountain'
    ? { fileName: `${name}.fountain`, text: `Title: ${document.title}\n\n${body}` }
    : { fileName: `${name}.md`, text: body };
}

export const BACKUP_FORMAT = 'epic-writer-backup';
export const BACKUP_VERSION = 1;

export interface ProjectBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: Date;
  project: ProjectDoc;
  ownerName: string | null;
  collections: Record<ProjectCollection, Document[]>;
}

/**
 * Every row the project owns, all versions and branches included (IO-7). Users and their AI keys
 * are never included; only the owner's name is.
 */
export async function exportProject(db: Db, ctx: { project: ProjectDoc }): Promise<ProjectBackup> {
  const id = ctx.project._id;
  const [project, ownerName, ...rows] = await Promise.all([
    projects.findById(db, id),
    backups.userName(db, ctx.project.ownerId),
    ...PROJECT_COLLECTIONS.map((c) => backups.projectRows(db, c, id)),
  ]);
  if (!project) throw new NotFound('Project not found');
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(),
    project,
    ownerName,
    collections: Object.fromEntries(
      PROJECT_COLLECTIONS.map((c, i) => [c, rows[i]!]),
    ) as unknown as Record<ProjectCollection, Document[]>,
  };
}

/** The backup as Extended JSON, so ObjectIds and Dates survive a restore. */
export async function exportProjectJson(db: Db, ctx: { project: ProjectDoc }): Promise<string> {
  return BSON.EJSON.stringify(await exportProject(db, ctx));
}

/** Reads a backup file's text (Extended JSON) and checks it is an Epic Writer backup. */
export function parseBackup(json: string): ProjectBackup {
  let data: unknown;
  try {
    data = BSON.EJSON.parse(json);
  } catch {
    throw new Invalid('That file isn’t valid backup JSON');
  }
  const b = data as Partial<ProjectBackup>;
  if (b?.format !== BACKUP_FORMAT || !b.project || !b.collections)
    throw new Invalid('That file isn’t an Epic Writer backup');
  if (b.version !== BACKUP_VERSION)
    throw new Invalid(`Backup version ${String(b.version)} isn’t supported by this version`);
  return b as ProjectBackup;
}

/**
 * Restores a project from a backup (IO-7), every version and its history, owned by `ownerId`.
 * Refuses when the project exists unless `replace` (the caller saves the current state first).
 * Jobs that were queued or running come back failed, so no AI runs on its own after a restore.
 */
export async function restoreProject(
  db: Db,
  backup: ProjectBackup,
  opts: { ownerId: ObjectId; replace?: boolean },
): Promise<{ projectId: ObjectId; rows: number }> {
  const project: ProjectDoc = {
    ...backup.project,
    ownerId: opts.ownerId,
    members: [{ userId: opts.ownerId, role: 'owner' }],
  };
  if ((await projects.findById(db, project._id)) && !opts.replace)
    throw new Conflict(
      `"${project.name}" already exists here. Restore with --replace to overwrite it.`,
    );
  const now = new Date();
  const rows = {
    ...backup.collections,
    jobs: (backup.collections.jobs ?? []).map((j) =>
      j.status === 'queued' || j.status === 'running'
        ? {
            ...j,
            status: 'failed',
            error: 'Interrupted by a restore',
            lockedBy: null,
            lockedUntil: null,
            updatedAt: now,
          }
        : j,
    ),
  };
  const session = db.client.startSession();
  try {
    const n = await session.withTransaction(() =>
      backups.replaceProject(db, project, rows, session),
    );
    return { projectId: project._id, rows: n };
  } finally {
    await session.endSession();
  }
}
