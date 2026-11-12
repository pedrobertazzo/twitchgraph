import { revalidatePath, revalidateTag } from 'next/cache';
import { verifyQStash, signingKeys } from '@/lib/qstash';
import { storeTag, tick } from '@/lib/refresher';

// Runs one background pass: a full count of everyone live, a point of history and (every other run) the clips of the
// day. Called every 15 minutes by an Upstash QStash schedule and once a day by Vercel Cron as a backup. A full count
// takes one to two minutes.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: Request) {
  // QStash's signature, or "Authorization: Bearer <secret>" for Vercel Cron (CRON_SECRET) and manual runs.
  const secrets = [process.env.REFRESH_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.length && !signingKeys().length)
    return Response.json({ error: 'Connect QStash to the project, or set CRON_SECRET, to enable the refresher.' }, { status: 503 });
  const body = req.method === 'POST' ? await req.text() : '';
  const bySecret = secrets.some((s) => req.headers.get('authorization') === `Bearer ${s}`);
  if (!bySecret && !verifyQStash(req.headers.get('upstash-signature'), body)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const report = await tick();
  for (const key of report.stored) revalidateTag(storeTag(key), { expire: 0 });
  if (report.stored.length) {
    revalidatePath('/');
    revalidatePath('/api/snapshot');
  }
  return Response.json(report);
}

export const GET = handle;
export const POST = handle;
