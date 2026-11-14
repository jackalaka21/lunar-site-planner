import type { Metadata, Viewport } from "next";
import "./globals.css";
import { panoramaPalette } from "../components/panorama/palette";
import { STAT_STRIP_KEY } from "../lib/storageKeys";
import { Providers } from "./providers";

// The installed app opens dark: take the dark body colour from the theme rather than repeating it here.
const DARK_BODY = panoramaPalette("dark").sky;
const TITLE = "Ridgeline — Lunar landing site & date planner";
const DESCRIPTION =
  "Compare lunar landing sites and dates: sunlight for power and Earth for comms, against the real terrain horizon.";

export const metadata: Metadata = {
  metadataBase: new URL("https://lunar-site-planner.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [
      { url: "/og.png", width: 1200, height: 630, alt: "Ridgeline: a ridge line under the Sun" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = { themeColor: DARK_BODY, width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-astryx-theme="ridgeline" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem(${JSON.stringify(STAT_STRIP_KEY)})==="1")document.documentElement.setAttribute("data-statstrip","dismissed")}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
