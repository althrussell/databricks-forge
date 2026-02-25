import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SidebarNav, MobileNav } from "@/components/pipeline/sidebar-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forge AI",
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <div className="flex min-h-screen">
            <SidebarNav />
            <div className="flex flex-1 flex-col overflow-auto">
              <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:justify-end md:px-6">
                <MobileNav />
                <ThemeToggle />
              </header>
              <main className="flex-1">
                <div className="w-full px-6 py-6">{children}</div>
              </main>
            </div>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
