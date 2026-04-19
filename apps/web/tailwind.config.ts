import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        noc: {
          bg: "#0a0e14",
          panel: "#0d1117",
          border: "#1e2a38",
          teal: "#00d4aa",
          amber: "#f59e0b",
          red: "#ef4444",
          text: "#d8e2ec",
          muted: "#7d8da1"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        "teal-glow": "0 0 18px rgba(0, 212, 170, 0.28)",
        "amber-glow": "0 0 18px rgba(245, 158, 11, 0.22)",
        "red-glow": "0 0 22px rgba(239, 68, 68, 0.24)"
      }
    }
  },
  plugins: []
} satisfies Config;
