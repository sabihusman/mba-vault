import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4, Public_Sans } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "./register-sw";
import { AppShell } from "./app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Study Desk typefaces (design handoff §1): serif headings/answers, Public Sans UI.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Set the theme class before first paint so class-based dark mode doesn't flash.
// Honors a saved choice (localStorage 'mv-theme', written by the future toggle),
// falling back to the OS preference. Kept tiny and inlined to run pre-hydration.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('mv-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export const metadata: Metadata = {
  applicationName: "MBA-Vault",
  title: {
    default: "MBA-Vault",
    template: "%s · MBA-Vault",
  },
  description:
    "Private, searchable vault over my MBA & Product School coursework — browse by topic and ask questions with cited sources.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MBA-Vault",
  },
  // Tab icon comes from the app/favicon.ico convention (basePath-aware); the PWA
  // icons are declared in the manifest. Avoids hardcoding the /vault prefix here.
  formatDetection: { telephone: false },
};

// themeColor / viewport live in their own export in the App Router metadata API.
export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${publicSans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-ui text-tx">
        <AppShell>{children}</AppShell>
        <RegisterSW />
      </body>
    </html>
  );
}
