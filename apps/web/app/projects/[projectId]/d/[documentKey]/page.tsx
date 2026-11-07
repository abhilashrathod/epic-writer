import { DocumentEditor } from '../../../../../components/DocumentEditor';

export default async function DocumentPage({
  params,
}: PageProps<'/projects/[projectId]/d/[documentKey]'>) {
  const { documentKey } = await params;
  return <DocumentEditor documentKey={documentKey} />;
}
