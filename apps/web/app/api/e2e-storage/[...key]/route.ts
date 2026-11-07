import { e2eStorage, isE2eBypass } from '../../../../lib/server';

// Stand-in for R2 during e2e runs (see getStorage). Answers 404 everywhere else.
type Ctx = RouteContext<'/api/e2e-storage/[...key]'>;
const notFound = () => new Response(null, { status: 404 });

export async function PUT(req: Request, { params }: Ctx) {
  if (!isE2eBypass()) return notFound();
  const key = (await params).key.join('/');
  const bytes = new Uint8Array(await req.arrayBuffer());
  await e2eStorage().write(key, req.headers.get('content-type') ?? '', bytes);
  return new Response(null, { status: 200 });
}

export async function GET(_req: Request, { params }: Ctx) {
  if (!isE2eBypass()) return notFound();
  const file = await e2eStorage().read((await params).key.join('/'));
  if (!file) return notFound();
  return new Response(new Uint8Array(file.bytes), { headers: { 'content-type': file.mime } });
}
