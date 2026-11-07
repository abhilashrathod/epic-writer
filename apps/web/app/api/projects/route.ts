import { createProject, listProjects } from '@epic/core';
import { createProjectBody, type ProjectDto } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../lib/http';
import { getAppDb } from '../../../lib/server';

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const projects: ProjectDto[] = (await listProjects(getAppDb(), user._id)).map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    }));
    return Response.json({ projects });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { name, templateKey } = await parseBody(req, createProjectBody);
    const p = await createProject(getAppDb(), { ownerId: user._id, name, templateKey });
    const project: ProjectDto = {
      id: p._id.toHexString(),
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      commitCount: 1,
    };
    return Response.json({ project }, { status: 201 });
  });
}
