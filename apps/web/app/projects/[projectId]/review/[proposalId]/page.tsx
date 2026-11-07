import { ReviewScreen } from '../../../../../components/review/ReviewScreen';

export default async function ReviewPage({
  params,
}: PageProps<'/projects/[projectId]/review/[proposalId]'>) {
  const { proposalId } = await params;
  return <ReviewScreen proposalId={proposalId} />;
}
