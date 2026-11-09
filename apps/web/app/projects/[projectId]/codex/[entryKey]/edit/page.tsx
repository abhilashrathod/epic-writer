import { Suspense } from 'react';
import { EntryEditorPage } from '../../../../../../components/codex/EntryEditorPage';

export default async function EditEntryPage({
  params,
}: PageProps<'/projects/[projectId]/codex/[entryKey]/edit'>) {
  const { entryKey } = await params;
  return (
    <Suspense>
      <EntryEditorPage entryKey={entryKey} />
    </Suspense>
  );
}
