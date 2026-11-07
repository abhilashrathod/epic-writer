import { Suspense } from 'react';
import { GuideView } from '../../../../components/story/GuideView';

export default function GuidePage() {
  return (
    <Suspense>
      <GuideView />
    </Suspense>
  );
}
