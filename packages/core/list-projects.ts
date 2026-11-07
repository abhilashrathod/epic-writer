import type { Db, ObjectId } from 'mongodb';
import { commits, projects } from '@epic/db';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: Date;
  commitCount: number;
  archived: boolean;
}

/** Projects the user owns or belongs to, newest first, with their commit counts. */
export async function listProjects(db: Db, userId: ObjectId): Promise<ProjectSummary[]> {
  const rows = await projects.listForUser(db, userId);
  const counts = await commits.countByProject(
    db,
    rows.map((p) => p._id),
  );
  return rows.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
    createdAt: p.createdAt,
    commitCount: counts.get(p._id.toHexString()) ?? 0,
    archived: !!p.archivedAt,
  }));
}
