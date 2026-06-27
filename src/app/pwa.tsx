"use client";

import { useEffect } from "react";

/** Registra el service worker que habilita la instalación como app. */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin service worker la web sigue funcionando con normalidad.
      });
    }
  }, []);
  return null;
}
