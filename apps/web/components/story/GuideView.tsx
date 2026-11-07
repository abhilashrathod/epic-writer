'use client';

import { useState } from 'react';
import { Button } from '@epic/ui';
import { api } from '../../lib/api-client';
import { useTree } from '../../lib/use-tree';
import { useEntities, useTypes } from '../../lib/use-types';
import { useUrlState } from '../../lib/use-url-state';
import { useWorkspace } from '../Workspace';
import { DocumentDetailsForm } from './DocumentDetailsForm';
import { WorkPicker } from './WorkPicker';

/**
 * Episode or chapter guide (WK-5): edit each episode's logline, summary and key events and each
 * container's arc summary in reading order, then download the guide built from them.
 */
export function GuideView() {
  const { projectId } = useWorkspace();
  const tree = useTree(projectId);
  const types = useTypes(projectId);
  const entries = useEntities(projectId);
  const { params, go } = useUrlState();
  const [downloadError, setDownloadError] = useState('');

  const error = [tree, types, entries].find((q) => q.error)?.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load the guide: {error.message}
      </p>
    );
  if ([tree, types, entries].some((q) => q.isPending))
    return <p className="p-8 text-muted">Opening the guide…</p>;

  const works = tree.data!.works;
  if (!works.length)
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Episode guide</h1>
        <p className="text-muted">
          The guide lists a work’s episodes or chapters. Create a work first.
        </p>
      </div>
    );
  const work = works.find((w) => w.key === params.get('work')) ?? works[0]!;
  const unit = work.levels.at(-1)?.singular ?? 'Episode';
  const docs = tree.data!.documents.filter((d) => d.workKey === work.key);
  const eventTypes = new Set(
    types.data!.types.filter((t) => t.traits.includes('event')).map((t) => t.key),
  );
  const events = entries
    .data!.filter((e) => eventTypes.has(e.typeKey) && e.canonState !== 'scrapped')
    .sort((a, b) => a.name.localeCompare(b.name));

  const download = async () => {
    setDownloadError('');
    try {
      const { title, markdown } = await api<{ title: string; markdown: string }>(
        `/api/projects/${projectId}/works/${work.key}/guide`,
      );
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^\p{L}\p{N} -]/gu, '').trim() || 'guide'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed. Try again.');
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 px-6 py-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{unit} guide</h1>
        <WorkPicker works={works} current={work.key} onPick={(k) => go({ work: k })} />
        <Button variant="primary" className="ml-auto" onClick={download} disabled={!docs.length}>
          Download guide
        </Button>
      </header>
      {downloadError && (
        <p role="alert" className="text-sm text-bad">
          {downloadError}
        </p>
      )}
      {docs.length === 0 ? (
        <p className="text-muted">
          Add a {unit.toLowerCase()} to {work.name} to start its guide.
        </p>
      ) : (
        docs.map((d) => (
          <DocumentDetailsForm key={d.key} projectId={projectId} doc={d} events={events} />
        ))
      )}
    </div>
  );
}
