import { getSnapshot } from '@/lib/twitch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await getSnapshot();
    return Response.json(snap, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Twitch is not answering right now.' }, { status: 502 });
  }
}
