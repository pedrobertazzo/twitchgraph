// Runs once when a server instance starts. On a long-running server it starts the background count, so history is
// being collected before anyone visits. On Vercel (serverless) a QStash schedule calls /api/refresh instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VERCEL || !process.env.TWITCH_CLIENT_ID) return;
  const { startRefreshLoop } = await import('./lib/loop');
  startRefreshLoop();
}
