import type { Metadata } from "next";
import { Suspense } from "react";
import { Space_Grotesk, Archivo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { GlobalNavigationLoader } from "@/components/navigation/GlobalNavigationLoader";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "AiM Apps",
  description: "AI Marketing Academy Apps Platform",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${archivo.variable} font-sans`} suppressHydrationWarning>
        {/* All product apps lock themselves to dark via the
            `product-app-theme` class scope; admin keeps the
            ThemeToggle for its own header chrome. We default to
            dark + disable system detection so there's no flash of
            light mode before product-app-theme paints. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
        >
          {/* Global SVG gradient definition for help icon */}
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <defs>
              <linearGradient id="helpIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#31DBA5" />
                <stop offset="100%" stopColor="#1C4C8A" />
              </linearGradient>
            </defs>
          </svg>
          <Suspense fallback={null}>
            <GlobalNavigationLoader />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
