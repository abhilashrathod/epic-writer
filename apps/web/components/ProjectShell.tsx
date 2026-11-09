'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button, Icon, focusRing } from '@epic/ui';
import { AsOfControl } from './AsOfControl';
import { WorksTree } from './WorksTree';
import { useWorkspace } from './Workspace';

const NAV: { title: string; items: [path: string, label: string, icon: string][] }[] = [
  {
    title: 'World',
    items: [
      ['codex', 'Codex', 'book'],
      ['graph', 'Family trees and web', 'family'],
      ['timeline', 'Timeline', 'clock'],
    ],
  },
  {
    title: 'Story',
    items: [
      ['storylines', 'Storylines', 'threads'],
      ['guide', 'Episode guide', 'scroll'],
      ['overview', 'Overview', 'grid'],
    ],
  },
  {
    title: 'Tools',
    items: [
      ['ask', 'Ask the codex', 'chat'],
      ['import', 'Import notes', 'upload'],
      ['settings', 'Settings', 'sliders'],
    ],
  },
];

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
  const pathname = usePathname();
  // Focus mode hides the chrome with CSS. Changing the tree instead would remount the editor and
  // throw away unsaved text.
  const chrome = focus ? 'hidden' : '';

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside
        className={`${navOpen && !focus ? 'flex' : 'hidden'} fixed inset-0 bottom-14 z-20 flex-col gap-4 overflow-y-auto bg-panel p-4 md:sticky md:top-0 md:h-dvh md:self-start md:w-72 md:shrink-0 ${focus ? '' : 'md:flex'}`}
        aria-label="Works"
      >
        <div>
          <Link href="/" className={`text-sm text-muted hover:text-ink ${focusRing}`}>
            ← All projects
          </Link>
          <p className="mt-1 text-lg font-semibold tracking-tight">{projectName}</p>
        </div>
        <nav aria-label="Project" className="flex flex-col gap-4">
          {NAV.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <p className="px-3 text-xs font-medium uppercase tracking-wide text-faint">
                {group.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map(([path, label, icon]) => {
                  const href = `/projects/${projectId}/${path}`;
                  const active = pathname.startsWith(href);
                  return (
                    <li key={path}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setNavOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium ${focusRing} ${active ? 'bg-selected text-on-selected' : 'text-ink hover:bg-sunk'}`}
                      >
                        <Icon name={icon} className="shrink-0 text-lg" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
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
