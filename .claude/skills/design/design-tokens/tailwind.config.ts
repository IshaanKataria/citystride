import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-foreground)",
        },
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
        },
        destructive: {
          DEFAULT: "var(--color-destructive)",
          foreground: "var(--color-destructive-foreground)",
        },
        border: "var(--color-border)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        DEFAULT: "var(--radius-default)",
      },
      spacing: {
        0: "var(--spacing-0)",
        1: "var(--spacing-1)",
        2: "var(--spacing-2)",
        3: "var(--spacing-3)",
        4: "var(--spacing-4)",
        6: "var(--spacing-6)",
        8: "var(--spacing-8)",
        12: "var(--spacing-12)",
        16: "var(--spacing-16)",
      },
      fontSize: {
        xs: "var(--font-size-xs)",
        sm: "var(--font-size-sm)",
        base: "var(--font-size-base)",
        lg: "var(--font-size-lg)",
        xl: "var(--font-size-xl)",
        "2xl": "var(--font-size-2xl)",
      },
    },
  },
  plugins: [],
} satisfies Config;
