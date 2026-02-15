import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SidebarNav } from "@/components/pipeline/sidebar-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Databricks Inspire AI",
  description:
    "Discover AI-powered use cases from your Unity Catalog metadata",
  icons: {
    icon: "/databricks-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex min-h-screen">
          <SidebarNav />
          <main className="flex-1 overflow-auto">
            <div className="w-full px-6 py-8">{children}</div>
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
