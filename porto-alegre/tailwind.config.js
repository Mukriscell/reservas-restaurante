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
          600: "#00873e",
          700: "#067a3d",
          800: "#05603a",
          900: "#054f31",
          950: "#022c1c",
        },
        // Amarillo Brasil (secundario) — reservado para acentos y totales.
        amarillo: {
          50: "#fefbe8",
          100: "#fef7c3",
          200: "#feee95",
          300: "#fde272",
          400: "#facc15",
          500: "#eab308",
          600: "#ca8a04",
          700: "#a16207",
          800: "#854d0e",
          900: "#713f12",
          950: "#422006",
        },
        // Azul/navy elegante (apoyo + fondos en modo oscuro).
        azul: {
          50: "#eef4ff",
          100: "#e0eaff",
          200: "#c7d7fe",
          300: "#a4bcfd",
          400: "#8098f9",
          500: "#6172f3",
          600: "#444ce7",
          700: "#3538cd",
          800: "#1d2440",
          900: "#131a33",
          950: "#0b1322",
        },
      },
      boxShadow: {
        suave: "0 1px 2px rgb(11 19 34 / 0.05), 0 6px 20px rgb(11 19 34 / 0.08)",
        realce: "0 8px 30px rgb(0 135 62 / 0.18)",
      },
      keyframes: {
        "subir": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "aparecer": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pop": {
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
