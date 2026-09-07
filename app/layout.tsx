import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Letter Reader",
  description: "Local letter-summarizing desktop app. Runs on your own Claude Code session.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
