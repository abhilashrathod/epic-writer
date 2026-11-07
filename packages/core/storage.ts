import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AwsClient } from 'aws4fetch';

/** Object storage for uploads. Browsers talk to it only through short-lived signed URLs. */
export interface Storage {
  /** A URL the browser can PUT the file to, with this Content-Type, for the next 10 minutes. */
  uploadUrl(key: string, mime: string): Promise<string>;
  /** A URL that shows the object for the next hour. */
  viewUrl(key: string): Promise<string>;
  /** Size and type of a stored object, or null if there is none. */
  head(key: string): Promise<{ size: number; mime: string } | null>;
  remove(key: string): Promise<void>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

const UPLOAD_SECONDS = 600;
const VIEW_SECONDS = 3600;

/** Cloudflare R2 through its S3-compatible API. */
export function r2Storage(cfg: R2Config): Storage {
  const aws = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
  const objectUrl = (key: string, seconds?: number) => {
    const u = new URL(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`);
    if (seconds) u.searchParams.set('X-Amz-Expires', String(seconds));
    return u.toString();
  };
  const presign = async (method: string, key: string, seconds: number, mime?: string) =>
    (
      await aws.sign(objectUrl(key, seconds), {
        method,
        headers: mime ? { 'content-type': mime } : undefined,
        aws: { signQuery: true },
      })
    ).url;

  return {
    uploadUrl: (key, mime) => presign('PUT', key, UPLOAD_SECONDS, mime),
    viewUrl: (key) => presign('GET', key, VIEW_SECONDS),
    async head(key) {
      const res = await aws.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage HEAD failed (${res.status})`);
      return {
        size: Number(res.headers.get('content-length') ?? 0),
        mime: res.headers.get('content-type') ?? '',
      };
    },
    async remove(key) {
      const res = await aws.fetch(objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Storage DELETE failed (${res.status})`);
    },
  };
}

/**
 * A disk-backed stand-in for e2e and local runs without R2. Its URLs point at `routeBase`, an app
 * route that reads and writes `dir` (see apps/web/app/api/e2e-storage). Never used in production.
 */
export function diskStorage(
  dir: string,
  routeBase: string,
): Storage & {
  write(key: string, mime: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<{ mime: string; bytes: Buffer } | null>;
} {
  const root = resolve(dir);
  const file = (key: string) => {
    const p = resolve(join(root, key));
    if (!p.startsWith(`${root}/`)) throw new Error('Bad storage key');
    return p;
  };
  const meta = async (key: string) => {
    try {
      return await readFile(`${file(key)}.mime`, 'utf8');
    } catch {
      return null;
    }
  };
  return {
    uploadUrl: async (key) => `${routeBase}/${key}`,
    viewUrl: async (key) => `${routeBase}/${key}`,
    async head(key) {
      const mime = await meta(key);
      if (mime === null) return null;
      return { size: (await stat(file(key))).size, mime };
    },
    async remove() {
      // Disk storage is throwaway test data.
    },
    async write(key, mime, bytes) {
      await mkdir(dirname(file(key)), { recursive: true });
      await writeFile(file(key), bytes);
      await writeFile(`${file(key)}.mime`, mime);
    },
    async read(key) {
      const mime = await meta(key);
      return mime === null ? null : { mime, bytes: await readFile(file(key)) };
    },
  };
}
