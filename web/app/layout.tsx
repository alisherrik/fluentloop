import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'FluentLoop', description: 'Your English corrections, in one place.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
