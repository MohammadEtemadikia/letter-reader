import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Administration Assistant",
  description: "Local administration assistant: reads your post, files it per company, and tracks what still needs doing. Runs on your own Claude Code session.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
