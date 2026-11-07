import { ObjectId, type Db } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import { branches, projects, type CalendarBody, type ProjectDoc } from '@epic/db';
import { commitInSession } from './commit';
import { Invalid } from './errors';

export interface CreateProjectInput {
  ownerId: ObjectId;
  name: string;
  templateKey: 'blank';
}

export const DEFAULT_CALENDAR: CalendarBody = {
  name: 'Default calendar',
  epochOffset: 0,
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
  daysPerWeek: 7,
  weekdayNames: Array.from({ length: 7 }, (_, i) => `Day ${i + 1}`),
  eras: [{ name: 'Era', abbr: 'E', startDay: 0, direction: 1 }],
  displayFormat: '{day} {month}, {year} {era}',
};

/** Creates a project, its main branch, and the default calendar as commit 1, atomically. */
export async function createProject(db: Db, input: CreateProjectInput): Promise<ProjectDoc> {
  const name = input.name.trim();
  if (!name) throw new Invalid('Project name is empty');
  if (name.length > 200) throw new Invalid('Project name is longer than 200 characters');

  const branchId = new ObjectId();
  const calendarKey = uuidv7();
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
          defaultCalendarKey: calendarKey,
          units: [],
          typeGroups: [],
          aiSettings: {
            provider: 'anthropic',
            models: { extraction: '', continuity: '', suggestions: '', chat: '', embedding: '' },
            autoRun: false,
            monthlyCapMicros: 0,
          },
          overview: {
            logline: '',
            tagline: '',
            synopsisShort: '',
            synopsisLong: '',
            premise: '',
            genres: [],
            tone: '',
            hook: '',
            arc: '',
            keyQuestions: [],
            themeKeys: [],
          },
          visual: { palette: [], moodKeywords: [], moodboardAssetIds: [] },
          inspirations: [],
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
        changes: [
          { op: 'create', collection: 'calendars', key: calendarKey, data: DEFAULT_CALENDAR },
        ],
      });
      return { ...project, seqCounter: 1 };
    });
  } finally {
    await session.endSession();
  }
}
