import { Suspense } from 'react';
import { EntryEditorPage } from '../../../../../components/codex/EntryEditorPage';

export default function NewEntryPage() {
  return (
    <Suspense>
      <EntryEditorPage />
    </Suspense>
  );
}
