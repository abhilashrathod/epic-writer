import { DocumentEditor } from '../../../../../components/DocumentEditor';

export default async function DocumentPage({
  params,
  searchParams,
}: PageProps<'/projects/[projectId]/d/[documentKey]'>) {
  const { documentKey } = await params;
  // `?scene=` comes from an entry's appearances: open with the cursor at that scene.
  const { scene } = await searchParams;
  return (
    <DocumentEditor
      documentKey={documentKey}
      sceneKey={typeof scene === 'string' ? scene : undefined}
    />
  );
}
