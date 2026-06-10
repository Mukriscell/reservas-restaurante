import type { Metadata } from "next";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MESALISTA — Reserva tu mesa",
  description:
    "Sistema de reservas de mesas para restaurante: buffet, salones y atención accesible.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <header className="border-b border-brand-100 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
                <UtensilsCrossed className="h-5 w-5" />
              </span>
              <span className="text-xl font-bold tracking-tight text-brand-800">
                MESALISTA
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/" className="text-stone-600 hover:text-brand-700">
                Reservar
              </Link>
              <Link
                href="/admin"
                className="text-stone-600 hover:text-brand-700"
              >
                Administración
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="border-t border-brand-100 bg-white py-6 text-center text-xs text-stone-500">
          MESALISTA — Sistema de reservas para restaurantes
        </footer>
      </body>
    </html>
  );
}
