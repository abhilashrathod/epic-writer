import { notFound, redirect } from 'next/navigation';
import { NotFound } from '@epic/core';
import { ProjectShell } from '../../../components/ProjectShell';
import { WorkspaceProvider } from '../../../components/Workspace';
import { projectFor } from '../../../lib/project';
import { currentUser } from '../../../lib/session';

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<'/projects/[projectId]'>) {
  const user = await currentUser();
  if (!user) redirect('/signin');
  const { projectId } = await params;
  const ctx = await projectFor(projectId, user).catch((e: unknown) => {
    if (e instanceof NotFound) notFound();
    throw e;
  });
  return (
    <WorkspaceProvider projectId={projectId}>
      <ProjectShell projectName={ctx.project.name}>{children}</ProjectShell>
    </WorkspaceProvider>
  );
}
