import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Space_Grotesk, JetBrains_Mono, Luckiest_Guy, Vast_Shadow } from "next/font/google";
import "./globals.css";
import { PrivyAuthProvider } from "./components/PrivyProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthProvider } from "./components/AuthContext";
import { AppDataProvider } from "./contexts/AppDataContext";
import { CatProvider } from "./contexts/CatContext";
import Navbar from "./components/Navbar";
import BottomNavbar from "./components/BottomNavbar";
import LayoutContent from "./components/LayoutContent";
import PeekCat from "./components/PeekCat";

const robotoRound = localFont({
  src: "../public/fonts/Roboto-Round-Regular.ttf",
  variable: "--font-inter",
  weight: "400",
  style: "normal",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const luckiestGuy = Luckiest_Guy({
  variable: "--font-luckiest-guy",
  subsets: ["latin"],
  weight: ["400"],
});

const vastShadow = Vast_Shadow({
  variable: "--font-vast-shadow",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Hunch - Prediction Markets",
  description: "Trade on real-world outcomes. Predict the future on Solana.",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#06b6d4',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme - default to dark */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('hunch-theme');
                  if (theme === 'light' || theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', theme);
                  } else {
                    // Default to dark theme
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${robotoRound.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${luckiestGuy.variable} ${vastShadow.variable} antialiased`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <ThemeProvider>
          <PrivyAuthProvider>
            <AuthProvider>
              <AppDataProvider>
                <CatProvider>
                  <Navbar />
                  <LayoutContent>{children}</LayoutContent>
                  <BottomNavbar />
                  <PeekCat />
                </CatProvider>
              </AppDataProvider>
            </AuthProvider>
          </PrivyAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
