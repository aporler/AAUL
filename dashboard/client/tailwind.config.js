/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#070b12",
          800: "#0c1220",
          700: "#111a2e",
          600: "#1a2540"
        },
        ocean: {
          500: "#1f6feb",
          400: "#4ea1ff",
          300: "#87c2ff"
        },
        neon: {
          500: "#33f0b5"
        }
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      boxShadow: {
        glow: "0 0 30px rgba(31, 111, 235, 0.25)",
        soft: "0 10px 30px rgba(2, 6, 23, 0.6)"
      }
    }
  },
  plugins: []
};