---
name: design-tokens
description: Use when setting up a design token system, configuring Tailwind themes, creating CSS custom properties for colors/spacing/typography, or implementing the primitive-semantic-component token architecture in any frontend project.
version: "1.0.0"
tags: [design-tokens, css, variables, theme, tokens, frontend]
related: [color-system, responsive-layout, component-selection]
---

## What This Skill Covers

Three-layer token architecture that bridges design decisions and code. Tokens are CSS custom properties consumed by Tailwind utility classes — no runtime JavaScript, no custom hooks.

## Rules & Patterns

### Token Layers

```
Primitive (raw values) → Semantic (intent) → Component (scoped usage)
```

#### 1. Primitive Tokens — Raw Values

Named by what they ARE. Never used directly in components.

```css
:root {
  --color-blue-500: #2563eb;
  --color-blue-600: #1d4ed8;
  --color-gray-50: #f9fafb;
  --color-gray-900: #111827;
  --spacing-1: 0.25rem;
  --spacing-4: 1rem;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
}
```

#### 2. Semantic Tokens — Intent

Named by what they MEAN. These are what components consume.

```css
:root {
  --color-primary: var(--color-blue-500);
  --color-primary-foreground: #ffffff;
  --color-background: var(--color-gray-50);
  --color-foreground: var(--color-gray-900);
  --color-muted: var(--color-gray-100);
  --color-muted-foreground: var(--color-gray-500);
  --color-destructive: var(--color-red-500);
  --color-border: var(--color-gray-200);
  --radius-default: var(--radius-md);
}

.dark {
  --color-primary: var(--color-blue-400);
  --color-background: var(--color-gray-950);
  --color-foreground: var(--color-gray-50);
  --color-muted: var(--color-gray-800);
  --color-muted-foreground: var(--color-gray-400);
  --color-border: var(--color-gray-700);
}
```

#### 3. Component Tokens — Scoped (Optional)

Only when a component needs values that differ from semantics.

```css
:root {
  --sidebar-width: 16rem;
  --sidebar-width-collapsed: 4rem;
  --card-padding: var(--spacing-6);
  --input-height: 2.5rem;
}
```

### Tailwind Integration

#### Tailwind v4 (`@theme inline`)

```css
@import "tailwindcss";

@theme inline {
  --color-primary: var(--color-primary);
  --color-primary-foreground: var(--color-primary-foreground);
  --color-background: var(--color-background);
  --color-foreground: var(--color-foreground);
  --color-muted: var(--color-muted);
  --color-muted-foreground: var(--color-muted-foreground);
  --color-destructive: var(--color-destructive);
  --color-border: var(--color-border);
  --radius-default: var(--radius-default);
}
```

#### Tailwind v3 (`tailwind.config`)

```typescript
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
    },
  },
} satisfies Config;
```

### 1. Components Use Semantic Tokens Only

```tsx
// GOOD — semantic intent
<div className="bg-primary text-primary-foreground rounded-default p-4">

// BAD — raw primitive
<div className="bg-blue-500 text-white rounded-md p-4">

// BAD — hardcoded value
<div className="bg-[#2563eb] text-[#fff] rounded-[8px] p-[16px]">
```

### 2. Dark Mode via Token Swap, Not `dark:` Overrides

Dark mode works by redefining semantic tokens under `.dark` — components don't change.

```css
/* GOOD — one definition, two themes */
.dark { --color-background: var(--color-gray-950); }

/* BAD — manual overrides per component */
<div className="bg-white dark:bg-gray-950">
```

### 3. Spacing and Typography Use the Scale

Never use arbitrary values. Define a spacing scale and use it consistently.

```css
/* Define the scale */
:root {
  --spacing-0: 0;
  --spacing-1: 0.25rem;  /* 4px */
  --spacing-2: 0.5rem;   /* 8px */
  --spacing-3: 0.75rem;  /* 12px */
  --spacing-4: 1rem;     /* 16px */
  --spacing-6: 1.5rem;   /* 24px */
  --spacing-8: 2rem;     /* 32px */
  --spacing-12: 3rem;    /* 48px */
  --spacing-16: 4rem;    /* 64px */
}
```

### 4. Single CSS File for All Tokens

All tokens live in one global CSS file — the project's Tailwind CSS entry point. Never create separate token files or scatter variables across component CSS.

### 5. HSL Format for Color Tokens (Tailwind v3)

Store colors as HSL channel values without the `hsl()` wrapper so Tailwind can add opacity modifiers.

```css
:root {
  --primary: 221.2 83.2% 53.3%;        /* channels only */
  --primary-foreground: 210 40% 98%;
}
```

For Tailwind v4, use any CSS color format — opacity modifiers work natively.

## Anti-Patterns

1. **Custom React hooks for tokens** — `useTokens()`, `useTheme()` that return CSS values. Tokens are CSS, not JavaScript. Use Tailwind classes.
2. **`tokens.json` as source of truth** — JSON files that generate CSS. Just write the CSS directly.
3. **Runtime theme switching with JavaScript** — toggle a `.dark` class on `<html>`, let CSS do the rest.
4. **Inconsistent naming** — mixing `--bg-main` with `--color-background`. Follow the `--color-*`, `--spacing-*`, `--radius-*` convention.
5. **Skipping the primitive layer** — jumping straight to `--primary: #2563eb`. Primitives allow palette changes without touching semantics.

## Checklist

- [ ] Primitive tokens defined for all raw values (colors, spacing, radii, font sizes)
- [ ] Semantic tokens reference primitives and express intent
- [ ] Dark mode implemented by redefining semantic tokens under `.dark`
- [ ] No `dark:` utility overrides in component code
- [ ] Tailwind configured to consume semantic tokens
- [ ] Single CSS file for all token definitions
- [ ] No hardcoded hex, px, or rem values in components
- [ ] Spacing uses the defined scale — no arbitrary values
- [ ] Component tokens only where semantics don't fit
