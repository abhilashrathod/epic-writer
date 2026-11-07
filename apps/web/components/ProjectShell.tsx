'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Button } from '@epic/ui';
import { AsOfControl } from './AsOfControl';
import { WorksTree } from './WorksTree';
import { useWorkspace } from './Workspace';

/** Sidebar with the works tree beside the page. On phones the tree opens from a bottom bar. */
export function ProjectShell({
  projectName,
  children,
}: {
  projectName: string;
  children: ReactNode;
}) {
  const { focus, projectId } = useWorkspace();
  const [navOpen, setNavOpen] = useState(false);
  // Focus mode hides the chrome with CSS. Changing the tree instead would remount the editor and
  // throw away unsaved text.
  const chrome = focus ? 'hidden' : '';

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside
        className={`${navOpen && !focus ? 'flex' : 'hidden'} fixed inset-0 bottom-14 z-20 flex-col gap-4 overflow-y-auto bg-panel p-4 md:static md:w-72 md:shrink-0 ${focus ? '' : 'md:flex'}`}
        aria-label="Works"
      >
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← All projects
        </Link>
        <p className="font-semibold tracking-tight">{projectName}</p>
        <nav aria-label="Project" className="flex flex-col gap-0.5 text-sm">
          {[
            ['codex', 'Codex'],
            ['graph', 'Family trees and web'],
            ['timeline', 'Timeline'],
            ['storylines', 'Storylines'],
            ['guide', 'Episode guide'],
            ['ask', 'Ask the codex'],
            ['import', 'Import notes'],
            ['settings', 'AI settings'],
          ].map(([path, label]) => (
            <Link
              key={path}
              href={`/projects/${projectId}/${path}`}
              className="text-muted hover:text-ink"
            >
              {label}
            </Link>
          ))}
        </nav>
        <AsOfControl />
        <WorksTree onNavigate={() => setNavOpen(false)} />
      </aside>
      <main className="min-w-0 flex-1 pb-14 md:pb-0">{children}</main>
      <nav
        className={`fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around bg-panel md:hidden ${chrome}`}
      >
        <Button onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen}>
          {navOpen ? 'Close contents' : 'Contents'}
        </Button>
        <Link href="/" className="text-sm text-muted">
          Projects
        </Link>
      </nav>
    </div>
  );
}
