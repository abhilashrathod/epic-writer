'use client';

import { useProjectSettings } from '../../lib/use-project-settings';
import { useEntities } from '../../lib/use-types';
import { useWorkspace } from '../Workspace';
import { InspirationsEditor } from './InspirationsEditor';
import { OverviewForm } from './OverviewForm';
import { VisualEditor } from './VisualEditor';

/** The project overview page: overview (PR-5), visual references (PR-6), inspirations (PR-7). */
export function OverviewView() {
  const { projectId } = useWorkspace();
  const settings = useProjectSettings(projectId);
  const entries = useEntities(projectId);
  const error = settings.error ?? entries.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load the overview: {error.message}
      </p>
    );
  if (!settings.data || !entries.data)
    return <p className="p-8 text-muted">Opening the overview…</p>;
  const s = settings.data;
  const live = entries.data
    .filter((e) => e.canonState !== 'scrapped')
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-10 px-8 py-8">
      <OverviewForm projectId={projectId} overview={s.overview} entries={live} />
      <VisualEditor projectId={projectId} visual={s.visual} />
      <InspirationsEditor projectId={projectId} inspirations={s.inspirations} />
    </div>
  );
}
