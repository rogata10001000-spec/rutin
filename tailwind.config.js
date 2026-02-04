/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#F97316", // Comforting Orange
          dark: "#EA580C",
          foreground: "hsl(var(--primary-foreground))",
        },
        "background-light": "#FFFBF9", // Warm peach-tinted white
        "background-dark": "#181412",
        "warm-accent": "#FFF7ED",
        "warm-border": "#FED7AA",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Custom colors for Calm & Clay theme
        terracotta: {
          DEFAULT: "#E07A5F",
          foreground: "#fafaf9",
        },
        sage: {
          DEFAULT: "#81B29A",
          foreground: "#fafaf9",
        },
        stone: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          800: "#292524",
          900: "#1c1917",
        }
      },
      borderRadius: {
        lg: "2rem",
        md: "1rem",
        sm: "0.5rem",
        xl: "3rem",
        "2xl": "2rem",
        full: "9999px",
        DEFAULT: "1rem",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(41, 37, 36, 0.08), 0 0 8px -2px rgba(41, 37, 36, 0.04)",
        "soft-lg": "0 10px 40px -4px rgba(41, 37, 36, 0.1), 0 0 12px -4px rgba(41, 37, 36, 0.06)",
        ios: "0 4px 20px -2px rgba(249, 115, 22, 0.08), 0 2px 10px -2px rgba(0, 0, 0, 0.04)",
      },
      animation: {
        shimmer: "shimmer 2s infinite linear",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
    },
  },
  plugins: [],
};
