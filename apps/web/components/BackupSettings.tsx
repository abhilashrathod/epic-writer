'use client';

import { focusRing } from '@epic/ui';
import { useWorkspace } from './Workspace';

/** On-demand project backup (IO-7). Nightly backups are the worker's job. */
export function BackupSettings() {
  const { projectId } = useWorkspace();
  return (
    <section
      aria-labelledby="backup-heading"
      className="mx-auto flex max-w-2xl flex-col gap-3 px-6 pb-12"
    >
      <h2 id="backup-heading" className="text-lg font-semibold tracking-tight">
        Backup
      </h2>
      <p className="text-sm text-muted">
        One JSON file with everything in this project: the codex with its full history, every work
        and script, versions, AI proposals and issues. Your AI keys are never included.
      </p>
      <a
        href={`/api/projects/${projectId}/backup`}
        download
        className={`self-start rounded-md px-2 py-2 text-sm font-medium text-muted hover:text-ink ${focusRing}`}
      >
        Download backup
      </a>
    </section>
  );
}
