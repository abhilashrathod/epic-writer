import { ObjectId, type Db } from 'mongodb';
import { branches, projects, type CalendarBody, type ProjectDoc } from '@epic/db';
import { commitInSession } from './commit';
import { applyTemplate, BUILT_IN_TEMPLATES, type TemplateKey } from './templates';
import { emptyOverview, emptyVisual } from './defaults';
import { Invalid } from './errors';

export interface CreateProjectInput {
  ownerId: ObjectId;
  name: string;
  templateKey: TemplateKey;
}

/** The Blank template's calendar: one era, 12 months of 30 days. */
export const DEFAULT_CALENDAR: CalendarBody = BUILT_IN_TEMPLATES.blank.calendar;

/** Creates a project, its main branch, and the default calendar as commit 1, atomically. */
export async function createProject(db: Db, input: CreateProjectInput): Promise<ProjectDoc> {
  const name = input.name.trim();
  if (!name) throw new Invalid('Project name is empty');
  if (name.length > 200) throw new Invalid('Project name is longer than 200 characters');

  const branchId = new ObjectId();
  const template = applyTemplate(BUILT_IN_TEMPLATES[input.templateKey]);
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const project = await projects.insert(
        db,
        {
          ownerId: input.ownerId,
          members: [{ userId: input.ownerId, role: 'owner' }],
          name,
          description: '',
          templateKey: input.templateKey,
          mainBranchId: branchId,
          seqCounter: 0,
          defaultCalendarKey: template.calendarKey,
          units: template.units,
          typeGroups: template.typeGroups,
          aiSettings: {
            provider: 'anthropic',
            models: { extraction: '', continuity: '', suggestions: '', chat: '', embedding: '' },
            autoRun: false,
            monthlyCapMicros: 0,
          },
          overview: emptyOverview(),
          visual: emptyVisual(),
          inspirations: [],
          archivedAt: null,
        },
        { session },
      );
      await branches.insert(
        db,
        {
          _id: branchId,
          projectId: project._id,
          name: 'main',
          kind: 'main',
          parentBranchId: null,
          forkSeq: null,
          headSeq: 0,
          readOnly: false,
          status: 'active',
        },
        { session },
      );
      await commitInSession(db, session, {
        projectId: project._id,
        branchId,
        message: 'Create project',
        author: { kind: 'user', userId: input.ownerId },
        changes: template.changes,
      });
      return { ...project, seqCounter: 1 };
    });
  } finally {
    await session.endSession();
  }
}
