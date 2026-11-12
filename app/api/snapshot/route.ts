import { getExtras } from '@/lib/extras';
import { getSnapshot } from '@/lib/twitch';

// One copy a minute for everyone: open boards poll this, and Twitch is only asked when the cached copy is stale. The
// background extras (everyone live, history, clips) come from the store the refresher fills.
export const revalidate = 60;

export async function GET() {
  const [live, extras] = await Promise.all([getSnapshot(), getExtras()]); // a failure throws, so a bad response is never cached
  return Response.json({ ...live, extras });
}
