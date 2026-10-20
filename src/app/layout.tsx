import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'Decan Konnect Internet Services', description: 'Sell Wi-Fi access with your own captive portal, vouchers and M-Pesa.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#04AA6D' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
