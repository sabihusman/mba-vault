import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "./register-sw";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
