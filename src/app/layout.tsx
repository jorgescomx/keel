import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Keel — Your Customizable Work Board",
  description:
    "A fast, modern, customizable Kanban & project tracker built for clarity and speed.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} text-slate-900 dark:text-slate-100 overflow-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
