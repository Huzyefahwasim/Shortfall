import type { Metadata } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/instrument-serif/400.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shortfall · The exception desk',
  description: 'A shared workspace for invoice discrepancies, supporting evidence, and verified resolutions.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
