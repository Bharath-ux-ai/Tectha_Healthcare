import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/ui";

export const metadata: Metadata = {
  title: "TEC THA HEALTHCARE",
  description: "Six Modules. One Platform. Zero Silos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
