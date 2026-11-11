import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import 'morphgrid/styles.css';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const SITE_URL = (process.env.APP_URL ?? 'https://twitch.morphgrid.io').replace(/\/$/, '');
const DESCRIPTION = 'What Twitch is watching right now: top categories, biggest channels, languages and marathons, refreshed every minute.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'On Air for Twitch: live Twitch stats, right now',
  description: DESCRIPTION,
  openGraph: { type: 'website', url: '/', siteName: 'On Air', title: 'On Air for Twitch: live Twitch stats, right now', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0e0e10' },
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
