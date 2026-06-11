import type { MetadataRoute } from "next";

/**
 * Web App Manifest: hace que MESALISTA sea instalable como aplicación
 * en computadores (Chrome/Edge) y móviles (Android e iOS).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MESALISTA — Reservas de restaurante",
    short_name: "MESALISTA",
    description:
      "Reserva tu mesa: buffet, salones, abono y exportación a Excel.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdf6ee",
    theme_color: "#c25a15",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Reservar mesa", url: "/" },
      { name: "Administración", url: "/admin" },
    ],
  };
}
