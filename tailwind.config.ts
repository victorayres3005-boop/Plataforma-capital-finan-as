import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cf: {
          navy:        "#203b88",
          "navy-dark": "#162d6e",
          "navy-deep": "#0f1f5c",
          green:       "#73b815",
          "green-dark":"#5a9010",
          "green-light":"#a8d96b",
          "green-pale": "#f0f9e0",
          white:       "#ffffff",
          "bg":        "#f5f7fb",
          "surface":   "#edf2fb",
          "surface-2": "#dce8f8",
          border:      "#d1dcf0",
          "border-2":  "#b8cce8",
          dark:        "#111827",
          "dark-2":    "#1f2937",
          "text-1":    "#111827",
          "text-2":    "#374151",
          "text-3":    "#6b7280",
          "text-4":    "#9ca3af",
          danger:      "#dc2626",
          "danger-bg": "#fef2f2",
          warning:     "#d97706",
          "warning-bg":"#fffbeb",
          success:     "#16a34a",
          "success-bg":"#f0fdf4",
        },
      },
      fontFamily: {
        sans: ["'Open Sans'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        sm:    "0 1px 3px rgba(32,59,136,0.07), 0 1px 2px rgba(32,59,136,0.05)",
        md:    "0 4px 12px rgba(32,59,136,0.10), 0 2px 4px rgba(32,59,136,0.06)",
        lg:    "0 8px 24px rgba(32,59,136,0.12), 0 4px 8px rgba(32,59,136,0.08)",
        navy:  "0 4px 16px rgba(32,59,136,0.40)",
        green: "0 4px 16px rgba(115,184,21,0.40)",
        input: "0 0 0 3px rgba(32,59,136,0.12)",
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg, #0f1f5c 0%, #203b88 60%, #1a4fa8 100%)",
        "navy-gradient": "linear-gradient(180deg, #203b88 0%, #162d6e 100%)",
        "surface-gradient": "linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%)",
      },
      animation: {
        "fade-in":  "fadeIn 0.35s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
export default config;
