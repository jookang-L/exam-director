import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const a2z = localFont({
  src: [
    { path: "./fonts/A2Z-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/A2Z-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/A2Z-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/A2Z-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/A2Z-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-a2z",
  display: "swap",
});

export const metadata: Metadata = {
  title: "설화고 시험감독표",
  description: "정기시험 감독표 자동 배정 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={a2z.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
