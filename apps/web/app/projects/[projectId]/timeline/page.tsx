import { Suspense } from 'react';
import { TimelineView } from '../../../../components/story/TimelineView';

export default function TimelinePage() {
  return (
    <Suspense>
      <TimelineView />
    </Suspense>
  );
}
