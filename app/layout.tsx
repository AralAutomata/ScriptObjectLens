export const metadata = {
  title: 'Code Visualizer',
  description: 'Visualize your codebase',
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
