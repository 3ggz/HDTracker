import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BackTip } from "@/components/BackTip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Inline blocking script — runs before <body> renders so .dark is
// on <html> in time for the first paint. Also rewrites the
// theme-color meta so the mobile browser chrome (URL bar + bottom
// toolbar on iOS, notification bar on Android) matches the picked
// theme, not just the OS media query. Mirrors the logic in
// ThemeToggle: stored preference wins, otherwise follow the OS.
const themeBootstrap = `(function(){try{var s=localStorage.getItem('hd-theme');var d=s==='dark'||((s===null||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#0a0a0a');}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "HDTracker",
  description: "Vehicle inventory tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Static default; the inline bootstrap script and ThemeToggle
  // override this at runtime so the iOS / Android browser chrome
  // matches the *user-picked* theme, not the OS media query.
  themeColor: "#fafafa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
        {children}
        <BackTip />
      </body>
    </html>
  );
}
