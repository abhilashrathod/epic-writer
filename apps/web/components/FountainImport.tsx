'use client';

import { useRouter } from 'next/navigation';
import type { RefObject } from 'react';
import { api } from '../lib/api-client';
import { useTreeMutation } from '../lib/use-tree';
import { useWorkspace } from './Workspace';

/**
 * Hidden file input that imports a Fountain file as a new script under `parentKey` (IO-2) and
 * opens it. A menu item or button opens the picker through `inputRef`.
 */
export function FountainImport({
  workKey,
  parentKey,
  label,
  inputRef,
  onNavigate,
}: {
  workKey: string;
  parentKey: string | null;
  label: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onNavigate: () => void;
}) {
  const { projectId } = useWorkspace();
  const router = useRouter();
  const upload = useTreeMutation(projectId, async (file: File) =>
    api<{ key: string }>(`/api/projects/${projectId}/documents/import`, {
      method: 'POST',
      body: { workKey, parentKey, fileName: file.name, text: await file.text() },
    }),
  );
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".fountain,.spmd,.txt,text/plain"
        aria-label={label}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          upload.mutate(file, {
            onSuccess: (data) => {
              onNavigate();
              router.push(`/projects/${projectId}/d/${(data as { key: string }).key}`);
            },
          });
        }}
      />
      {upload.isPending && (
        <p role="status" className="px-2 text-sm text-muted">
          Importing script…
        </p>
      )}
      {upload.error && (
        <p role="alert" className="px-2 text-sm text-bad">
          Couldn’t import that file: {upload.error.message}
        </p>
      )}
    </>
  );
}
