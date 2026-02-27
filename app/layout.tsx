import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarNav, MobileNav } from "@/components/pipeline/sidebar-nav";
import { HeaderPageTitle } from "@/components/header-title";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchBar } from "@/components/search/search-bar";
import { AskForgePanel } from "@/components/assistant/ask-forge-panel";

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
          <TooltipProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
          >
            Skip to main content
          </a>
          <div className="flex h-screen">
            <SidebarNav />
            <div className="flex flex-1 flex-col overflow-auto">
              <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
                <MobileNav />
                <span className="text-sm font-semibold md:hidden">Forge AI</span>
                <div className="hidden flex-1 md:block">
                  <HeaderPageTitle />
                </div>
                <SearchBar />
                <AskForgePanel />
                <ThemeToggle />
              </header>
              <main id="main-content" className="flex-1">
                <div className="w-full px-6 py-6">{children}</div>
              </main>
            </div>
          </div>
          <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
