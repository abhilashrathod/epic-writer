'use client';

import { useProjectSettings } from '../../lib/use-project-settings';
import { useWorkspace } from '../Workspace';
import { CalendarsEditor } from './CalendarsEditor';
import { GeneralSettings } from './GeneralSettings';
import { UnitsEditor } from './UnitsEditor';

/** Project, calendars and units settings (PR-1, PR-3, PR-4). */
export function ProjectSettings() {
  const { projectId } = useWorkspace();
  const q = useProjectSettings(projectId);
  if (q.error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load project settings: {q.error.message}
      </p>
    );
  if (!q.data) return <p className="p-8 text-muted">Loading project settings…</p>;
  const s = q.data;
  return (
    <div className="flex flex-col gap-10 px-8 py-8">
      <GeneralSettings projectId={projectId} settings={s} />
      <CalendarsEditor
        projectId={projectId}
        calendars={s.calendars}
        defaultKey={s.defaultCalendarKey}
      />
      <UnitsEditor projectId={projectId} units={s.units} />
    </div>
  );
}
