import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import Link from "next/link";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/platform/authConfig";
import { isPlatformAdmin } from "@/lib/platform/org-context";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "æquilibri",
  description: "æquilibri — AI-assisted operations platform",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const withAuth = clerkEnabled();
  // The UC1/UC2/UC3 cross-app switcher is an internal operator aid, not a
  // customer-facing control — only platform operators see it. (Demo mode with
  // no auth configured is operator-by-definition, so it stays visible there.)
  const showAppSwitcher = await isPlatformAdmin();
  const body = (
    <html lang="en" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <nav className="ae-navbar">
          <div className="px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6 overflow-x-auto">
            <Link href="/" className="ae-brand shrink-0">
              æquilibri
            </Link>
            {showAppSwitcher && (
              <>
                <Link href="/uc1" className="text-sm text-[var(--ae-earth)] hover:text-[var(--ae-space)] whitespace-nowrap shrink-0">
                  <span className="uc-badge uc1-badge mr-1">UC1</span>
                  <span className="hidden sm:inline">Roofing</span>
                </Link>
                <Link href="/app/dulong-downs" className="text-sm text-[var(--ae-earth)] hover:text-[var(--ae-space)] whitespace-nowrap shrink-0">
                  <span className="uc-badge uc2-badge mr-1">UC2</span>
                  <span className="hidden sm:inline">Didi</span>
                </Link>
                <Link href="/app" className="text-sm text-[var(--ae-earth)] hover:text-[var(--ae-space)] whitespace-nowrap shrink-0">
                  <span className="uc-badge uc3-badge mr-1">UC3</span>
                  <span className="hidden sm:inline">MSME</span>
                </Link>
              </>
            )}
            {withAuth && (
              <div className="ml-auto shrink-0">
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            )}
          </div>
        </nav>
        <div className="flex-1">{children}</div>
        <footer className="ae-footer">æquilibri POC — Next.js port</footer>
      </body>
    </html>
  );
  return withAuth ? <ClerkProvider>{body}</ClerkProvider> : body;
}
