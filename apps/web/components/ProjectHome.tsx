'use client';

import { useTree } from '../lib/use-tree';
import { NewWorkForm } from './NewWorkForm';
import { useWorkspace } from './Workspace';

export function ProjectHome() {
  const { projectId } = useWorkspace();
  const tree = useTree(projectId);
  if (tree.isPending) return null;
  const empty = tree.data?.works.length === 0;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      {empty ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Start a work</h1>
            <p className="text-muted">
              A work is one telling of this world: a series, a novel, a film.
            </p>
          </div>
          <NewWorkForm />
        </>
      ) : (
        <p className="text-muted">Open an episode or chapter from the sidebar, or add one.</p>
      )}
    </div>
  );
}
