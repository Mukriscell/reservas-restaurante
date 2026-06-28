/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Verde Brasil (principal) — 600 es el verde bandera.
        verde: {
          50: "#ecfdf3",
          100: "#d1fadf",
          200: "#a6f4c5",
          300: "#6ce9a6",
          400: "#32d583",
          500: "#12b76a",
          600: "#009739",
          700: "#027a48",
          800: "#05603a",
          900: "#054f31",
          950: "#022c1c",
        },
        // Amarillo Brasil (secundario), desaturado para uso profesional.
        amarillo: {
          50: "#fefbe8",
          100: "#fef7c3",
          200: "#feee95",
          300: "#fde272",
          400: "#fac515",
          500: "#eaaa08",
          600: "#ca8504",
          700: "#a15c07",
          800: "#854a0e",
          900: "#713b12",
          950: "#432008",
        },
        // Azul oscuro elegante (apoyo) — familia del azul bandera #002776.
        azul: {
          50: "#eef4ff",
          100: "#e0eaff",
          200: "#c7d7fe",
          300: "#a4bcfd",
          400: "#8098f9",
          500: "#6172f3",
          600: "#444ce7",
          700: "#3538cd",
          800: "#2d31a6",
          900: "#1e2470",
          950: "#101840",
        },
      },
      boxShadow: {
        suave: "0 1px 3px rgb(16 24 64 / 0.06), 0 4px 16px rgb(16 24 64 / 0.07)",
        realce: "0 10px 34px rgb(0 135 62 / 0.18)",
        "glow-verde": "0 0 0 1px rgb(34 211 102 / 0.5), 0 0 18px 2px rgb(34 211 102 / 0.45)",
        "glow-amarillo": "0 0 0 1px rgb(250 204 21 / 0.5), 0 0 18px 2px rgb(250 204 21 / 0.45)",
        "glow-rojo": "0 0 0 1px rgb(244 63 94 / 0.5), 0 0 18px 2px rgb(244 63 94 / 0.5)",
        "glow-violeta": "0 0 0 1px rgb(167 139 250 / 0.5), 0 0 18px 2px rgb(167 139 250 / 0.45)",
        "glow-boton": "0 0 22px 1px rgb(34 211 102 / 0.55)",
      },
      keyframes: {
        subir: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        aparecer: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        pop: {
          "0%": { transform: "scale(0.96)" },
          "60%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        subir: "subir 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        aparecer: "aparecer 0.18s ease-out",
        pop: "pop 0.18s ease-out",
      },
    },
  },
  plugins: [],
};
