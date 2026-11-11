import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import 'morphgrid/styles.css';
import './globals.css';

const sans = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const SITE_URL = (process.env.APP_URL ?? 'https://twitch.morphgrid.io').replace(/\/$/, '');
const DESCRIPTION = 'What Twitch is watching right now: top categories, biggest channels, languages and marathons, refreshed every minute.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'On Air: live Twitch stats, right now',
  description: DESCRIPTION,
  openGraph: { type: 'website', url: '/', siteName: 'On Air', title: 'On Air: live Twitch stats, right now', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0d11' },
    { media: '(prefers-color-scheme: light)', color: '#eef0f3' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
