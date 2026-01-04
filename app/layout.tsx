import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FeelEd AI – Science Voice Learning',
  description: 'A bilingual (Tamil/English) voice-first science learning pilot.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Mukta+Malar:wght@400;500;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body { font-family: 'Nunito', sans-serif; }
          .font-tamil { font-family: 'Mukta Malar', sans-serif; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: #f1f1f1; }
          ::-webkit-scrollbar-thumb { background: #fbbf24; border-radius: 10px; }
        `}</style>
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}