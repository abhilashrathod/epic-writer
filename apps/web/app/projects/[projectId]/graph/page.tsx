import { Suspense } from 'react';
import { GraphViews } from '../../../../components/graph/GraphViews';

export default function GraphPage() {
  return (
    <Suspense>
      <GraphViews />
    </Suspense>
  );
}
