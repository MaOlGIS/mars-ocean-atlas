import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mars Ocean Atlas · MOLA Topography', description: 'Explore real NASA MOLA elevations and hypothetical oceans on a complete, area-weighted Mars map.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
