import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import Link from "next/link";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/platform/authConfig";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const withAuth = clerkEnabled();
  const body = (
    <html lang="en" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <nav className="ae-navbar">
          <div className="px-6 h-14 flex items-center gap-6">
            <Link href="/" className="ae-brand">
              æquilibri
            </Link>
            <Link href="/uc1" className="text-sm text-[var(--ae-earth)] hover:text-[var(--ae-space)]">
              <span className="uc-badge uc1-badge mr-1">UC1</span> Roofing
            </Link>
            <Link href="/app/dulong-downs" className="text-sm text-[var(--ae-earth)] hover:text-[var(--ae-space)]">
              <span className="uc-badge uc2-badge mr-1">UC2</span> Didi
            </Link>
            <Link href="/app" className="text-sm text-[var(--ae-earth)] hover:text-[var(--ae-space)]">
              <span className="uc-badge uc3-badge mr-1">UC3</span> MSME
            </Link>
            {withAuth && (
              <div className="ml-auto">
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
