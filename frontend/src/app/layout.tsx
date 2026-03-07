import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Code Structure Visualizer',
  description: 'Visualize object-oriented structure in TypeScript/JavaScript projects',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
