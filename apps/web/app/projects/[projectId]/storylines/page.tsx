import { Suspense } from 'react';
import { StorylinesView } from '../../../../components/story/StorylinesView';

export default function StorylinesPage() {
  return (
    <Suspense>
      <StorylinesView />
    </Suspense>
  );
}
