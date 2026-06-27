import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf6ee",
          100: "#f9e8d2",
          200: "#f2cfa4",
          300: "#eab06c",
          400: "#e28d3d",
          500: "#dc731f",
          600: "#c25a15",
          700: "#a14414",
          800: "#833817",
          900: "#6c2f16",
          950: "#3a1609",
        },
      },
    },
  },
  plugins: [],
};

export default config;
