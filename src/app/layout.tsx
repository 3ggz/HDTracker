import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BackTip } from "@/components/BackTip";
import { HomeFab } from "@/components/HomeFab";
import { ThemeSync } from "@/components/ThemeSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Inline blocking script — runs before <body> renders so the .dark
// class is on <html> in time for the first paint, and also (re)inserts
// the theme-color meta tag so the mobile browser chrome (iOS URL +
// toolbar, Android notification bar) matches the picked theme.
//
// iOS Safari and several Android browsers don't repaint chrome when
// theme-color's content attribute is mutated in place. The bootstrap
// nukes any existing tags and appends a fresh one — the only way to
// get a reliable re-read. ThemeSync runs the same remove-and-replace
// on the React side whenever the user picks a different theme.
const themeBootstrap = `(function(){try{var s=localStorage.getItem('hd-theme');var d=s==='dark'||((s===null||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var g=localStorage.getItem('hd-theme-style')==='glass';document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('glass',g);var ex=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ex.length;i++)ex[i].parentNode.removeChild(ex[i]);var m=document.createElement('meta');m.setAttribute('name','theme-color');m.setAttribute('content',g?(d?'#0b1020':'#e8edf7'):(d?'#0a0a0a':'#fafafa'));document.head.appendChild(m);}catch(e){}})();`;

export const metadata: Metadata = {
  title: "HDTracker",
  description: "Vehicle inventory tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // themeColor is intentionally omitted — the inline bootstrap below
  // owns the meta tag at runtime (remove-and-re-add is the only way
  // iOS / Android pick up a theme-color change). If we let Next.js
  // generate one from this field too, we'd have a duplicate tag and
  // some browsers race on which one wins.
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
        <ThemeSync />
        {children}
        <HomeFab />
        <BackTip />
      </body>
    </html>
  );
}
