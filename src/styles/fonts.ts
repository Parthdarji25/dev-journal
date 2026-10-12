import { IBM_Plex_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

// Self-hosted at build time by next/font. Latin only, swap, at most 2 weights per family.
export const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-display',
});

export const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-body',
});

export const codeFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-code',
  preload: false,
});
