import type { Config } from "tailwindcss";
import { tokens } from "./src/styles/tokens";

const t = (rem: number, lh: number) =>
  [`calc(${rem}rem * var(--ui-text, 1))`,
   { lineHeight: `calc(${lh}rem * var(--ui-text, 1))` }] as [string, { lineHeight: string }];

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        heading: ['Sora', 'sans-serif'],
        body: ['Sora', 'sans-serif'],
      },
      fontSize: {
        xs: t(0.8125, 1.25), sm: t(0.9375, 1.5), base: t(1, 1.6),
        lg: t(1.125, 1.75), xl: t(1.25, 1.75), "2xl": t(1.5, 2),
        "3xl": t(1.875, 2.25), "4xl": t(2.25, 2.5), "5xl": t(3, 3.25), "6xl": t(3.75, 4),
      },
      backgroundImage: {
        "gradient-brand": "none",
        "gradient-hero": "none",
      },
      colors: {
        border: "hsl(var(--border))",
        "border-hover": "hsl(var(--border-hover))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        "background-subtle": "hsl(var(--background-subtle))",
        surface: "hsl(var(--surface))",
        tertiary: "hsl(var(--tertiary))",
        info: "hsl(var(--info))",
        "success-text": "hsl(var(--success-text))",
        "warning-text": "hsl(var(--warning-text))",
        "destructive-text": "hsl(var(--destructive-text))",
        cat: {
          1: "hsl(var(--cat-1))", 2: "hsl(var(--cat-2))", 3: "hsl(var(--cat-3))", 4: "hsl(var(--cat-4))",
          5: "hsl(var(--cat-5))", 6: "hsl(var(--cat-6))", 7: "hsl(var(--cat-7))", 8: "hsl(var(--cat-8))",
        },
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          subtle: "hsl(var(--accent-subtle))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        // Apple-style shadow tokens (additive — Tailwind defaults remain).
        ...tokens.shadow,
        card: "0 1px 2px rgb(15 23 42 / 0.06)",
        elegant: "0 8px 24px rgb(15 23 42 / 0.10)",
        sheet: "-4px 0 24px rgb(15 23 42 / 0.08)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
