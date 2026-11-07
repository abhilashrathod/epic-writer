import { Suspense } from 'react';
import { CodexBrowser } from '../../../../components/codex/CodexBrowser';

export default function CodexPage() {
  return (
    <Suspense>
      <CodexBrowser />
    </Suspense>
  );
}
