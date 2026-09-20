/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f5ff",
          100: "#e6ebff",
          200: "#c3cfff",
          300: "#9fb2ff",
          400: "#7b8fff",
          500: "#5468f5",
          600: "#4150d6",
          700: "#333fac",
          800: "#272f83",
          900: "#1b215c",
        },
      },
    },
  },
  plugins: [],
};
