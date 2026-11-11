import { getSnapshot } from '@/lib/twitch';

// One copy a minute for everyone: open boards poll this, and Twitch is only asked when the cached copy is stale.
export const revalidate = 60;

export async function GET() {
  return Response.json(await getSnapshot()); // a failure throws, so a bad response is never cached
}
