import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Cipher — Messagerie sécurisée temps réel",
    template: "%s · Cipher",
  },
  description:
    "Messagerie chiffrée de bout en bout, temps réel, avec 2FA, IA locale et recherche full-text avancée.",
  keywords: ["messagerie", "chat", "E2E", "2FA", "temps réel", "sécurisé"],
  authors: [{ name: "Cipher" }],
  openGraph: {
    title: "Cipher — Messagerie sécurisée temps réel",
    description: "Chiffrement E2E, 2FA, IA locale, recherche avancée.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
