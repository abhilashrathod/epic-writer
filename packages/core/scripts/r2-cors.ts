// Lets browsers upload straight to the R2 bucket: allows PUT (and GET for viewing) from the app's
// origins. Usage: pnpm r2:cors [origin ...]   (default http://localhost:3000)
import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { logger } from '@epic/schemas/logger';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set in .env`);
  return v;
};
const origins = process.argv.slice(2).length ? process.argv.slice(2) : ['http://localhost:3000'];
const xml = `<CORSConfiguration><CORSRule>${origins
  .map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`)
  .join(
    '',
  )}<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedHeader>content-type</AllowedHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;

const aws = new AwsClient({
  accessKeyId: need('R2_ACCESS_KEY_ID'),
  secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
  service: 's3',
  region: 'auto',
});
const res = await aws.fetch(
  `https://${need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${need('R2_BUCKET')}?cors`,
  {
    method: 'PUT',
    body: xml,
    headers: {
      'content-type': 'application/xml',
      'content-md5': createHash('md5').update(xml).digest('base64'),
    },
  },
);
if (!res.ok) {
  logger.error(
    res.status === 403
      ? 'This R2 token can’t change bucket settings. Add the rule in the Cloudflare dashboard (R2 → bucket → Settings → CORS policy) or use an Admin token.'
      : 'Setting the bucket CORS rule failed',
    { status: res.status, body: await res.text() },
  );
  process.exit(1);
}
logger.info('bucket CORS rule set', { origins });
