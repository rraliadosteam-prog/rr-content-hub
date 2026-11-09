import type { NextConfig } from "next";

/**
 * Security headers. The hub is a public read-only surface today, so it is also
 * the easiest thing on the internet to try to frame, embed or fingerprint.
 */
const isDevelopment = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  isDevelopment ? "'unsafe-eval'" : "",
  "https://platform.instagram.com",
  // Google Picker y Google Identity Services (el módulo de material).
  // El Picker se carga desde `apis.google.com` y el token se pide con
  // `accounts.google.com`: sin estas dos líneas, elegir carpeta de Drive
  // falla con un error de CSP que no dice nada de Drive.
  "https://apis.google.com",
  "https://accounts.google.com",
].filter(Boolean).join(" ");

const securityHeaders = [
  // The hub must not be embeddable by others (clickjacking). This is about
  // OTHER sites framing US. It does not stop us framing Instagram in an
  // iframe — that is `frame-src` below, and confusing the two cost a whole
  // round of "the preview does not load".
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js dev needs unsafe-eval for React call stacks; production keeps it out.
      // platform.instagram.com is Meta's own embed script: it arrives from the
      // `<script>` the InstagramEmbed component adds, so it must be allowed
      // here or the preview silently never renders.
      scriptSrc,
      // The embed injects inline styles into our document.
      "style-src 'self' 'unsafe-inline' https://platform.instagram.com",
      // Reference embeds and delivered media come from Supabase and Drive.
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com",
      // Video previews are iframed, not pictured. Without these the embed is
      // refused and the piece looks broken: the `frame-src` list was Drive and
      // Supabase only, so no social platform could ever load here. Wundeer's
      // sandbox prototype also lives on Railway and is embedded by `/wundeer/redes`.
      "frame-src 'self' https://www.instagram.com https://instagram.com https://www.tiktok.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.facebook.com https://drive.google.com https://*.supabase.co https://*.google.com https://commerce-wundeer-beta.up.railway.app",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Once, and it must agree with X-Frame-Options: nobody frames the hub.
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // El service worker vive en el ambito raiz para poder cachear el armazon
      // de Next (`/_next/static/...`). Con el ambito por defecto (`/sw.js`)
      // notendria acceso a esas rutas y la app no arrancaria sin conexion.
      //
      // `Service-Worker-Allowed: /` es lo que autoriza ese ambito. Y `no-store`
      // en el propio archivo: si el navegador cachea el service worker, la
      // version nueva no llega nunca y la app se queda pegada a la anterior.
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      // El manifest cambia con cada despliegue de iconos: que no se quede uno viejo.
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
