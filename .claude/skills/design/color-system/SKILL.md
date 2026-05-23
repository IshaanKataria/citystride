---
name: color-system
description: Use when setting up color palettes, implementing dark mode, choosing semantic color tokens, ensuring WCAG contrast compliance, or defining interactive states (hover, focus, disabled) for a Tailwind CSS or shadcn/ui project.
version: "1.0.0"
tags: [colors, palette, theme, dark-mode, light-mode, css]
related: [design-tokens, ui-accessibility]
---

## What This Skill Covers

Semantic color tokens consumed through Tailwind utility classes. Colors express intent (primary, destructive, muted), not appearance (blue, red, gray). Dark mode works by swapping token values, not by adding `dark:` overrides.

## Rules & Patterns

### Semantic Color Palette

Every project needs these semantic tokens at minimum:

| Token | Purpose | Light Example | Dark Example |
|---|---|---|---|
| `background` | Page background | white | gray-950 |
| `foreground` | Primary text | gray-900 | gray-50 |
| `primary` | Brand actions, active elements | blue-600 | blue-400 |
| `primary-foreground` | Text on primary | white | gray-950 |
| `secondary` | Alternative actions | gray-100 | gray-800 |
| `secondary-foreground` | Text on secondary | gray-900 | gray-50 |
| `muted` | Subtle backgrounds | gray-100 | gray-800 |
| `muted-foreground` | Secondary text, placeholders | gray-500 | gray-400 |
| `accent` | Highlights, hover states | gray-100 | gray-800 |
| `accent-foreground` | Text on accent | gray-900 | gray-50 |
| `destructive` | Danger, delete, errors | red-500 | red-400 |
| `destructive-foreground` | Text on destructive | white | gray-950 |
| `border` | Borders, dividers | gray-200 | gray-700 |
| `input` | Input borders | gray-300 | gray-700 |
| `ring` | Focus rings | blue-500 | blue-400 |

### Status Colors

Use semantic variants for status, not raw color names.

```tsx
// GOOD — semantic intent
<Badge variant="destructive">Failed</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="default">Active</Badge>

// BAD — raw colors that break in dark mode
<span className="text-red-500">Failed</span>
<span className="text-yellow-600">Pending</span>
<span className="text-green-500">Active</span>
```

When you need status colors beyond the base palette, define them as semantic tokens:

```css
:root {
  --color-success: #059669;
  --color-success-foreground: #ffffff;
  --color-warning: #d97706;
  --color-warning-foreground: #ffffff;
  --color-info: #2563eb;
  --color-info-foreground: #ffffff;
}

.dark {
  --color-success: #34d399;
  --color-success-foreground: #022c22;
  --color-warning: #fbbf24;
  --color-warning-foreground: #422006;
  --color-info: #60a5fa;
  --color-info-foreground: #1e3a5f;
}
```

### Dark Mode Implementation

#### Theme Toggle

Toggle a `.dark` class on `<html>`. Persist preference in `localStorage`. Respect `prefers-color-scheme` as default.

```typescript
type Theme = "light" | "dark" | "system";

const applyTheme = (theme: Theme): void => {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.classList.toggle("dark", isDark);
};
```

#### Tailwind Config

```typescript
// tailwind.config.ts (v3)
export default {
  darkMode: "class",
  // ...
} satisfies Config;
```

Tailwind v4 uses `class` strategy by default.

#### Rules for Dark Mode

1. **Never use `dark:` utility overrides** — change the token values under `.dark`, not individual components
2. **Lighten, don't invert** — dark mode primary is a lighter shade of the same hue, not the complementary color
3. **Reduce contrast slightly** — pure white (#fff) on pure black (#000) causes eye strain. Use gray-50 on gray-950
4. **Elevate with lighter backgrounds** — in dark mode, higher-elevation surfaces (cards, modals) use slightly lighter backgrounds to create depth
5. **Test both modes** — every UI state (empty, error, loading, full) in both light and dark

### Contrast Requirements

#### WCAG AA Ratios

| Element | Required Ratio | How to Check |
|---|---|---|
| Body text | 4.5:1 | `foreground` against `background` |
| Large text (≥ 18px / ≥ 14px bold) | 3:1 | Heading against background |
| UI components (borders, icons) | 3:1 | `border` against `background` |
| Placeholder text | 4.5:1 | `muted-foreground` against `input` bg |

#### Common Contrast Failures

```css
/* FAIL — gray-400 on white = 2.7:1 */
--color-muted-foreground: #9ca3af; /* too light */

/* PASS — gray-500 on white = 4.6:1 */
--color-muted-foreground: #6b7280; /* meets AA */
```

#### Never Rely on Color Alone

Always pair color with another indicator:

```tsx
// GOOD — color + icon + label
<div className="flex items-center gap-2 text-destructive">
  <AlertCircleIcon className="size-4" />
  <span>Payment failed</span>
</div>

// BAD — color only
<p className="text-red-500">Payment failed</p>
```

### Interactive States

Define consistent state colors across all interactive elements:

| State | Background Change | Border Change | Text Change |
|---|---|---|---|
| Default | `bg-primary` | `border-input` | `text-foreground` |
| Hover | `bg-primary/90` | `border-primary` | — |
| Focus | — | `ring-2 ring-ring` | — |
| Active/Pressed | `bg-primary/80` | — | — |
| Disabled | `bg-muted` | `border-input` | `text-muted-foreground` |

```tsx
// GOOD — consistent states via Tailwind
<button className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground">
  Submit
</button>
```

Use the `cn()` utility for conditional state classes, not ternary template literals.

## Anti-Patterns

1. **Raw color names in components** — `bg-blue-500`, `text-gray-600`. Use semantic tokens.
2. **`dark:` overrides** — `bg-white dark:bg-gray-900`. Swap tokens under `.dark` instead.
3. **Hardcoded hex values** — `bg-[#2563eb]`. Define a token.
4. **Status by color only** — red/green without text or icons. Inaccessible to colorblind users.
5. **Pure black backgrounds** — `bg-black` in dark mode. Use `bg-gray-950` for less eye strain.
6. **Inconsistent opacity for states** — hover at `/90`, `/80`, `/70` across different components. Pick one scale.
7. **Gray-400 for secondary text** — fails contrast on white backgrounds. Use gray-500 minimum.

## Checklist

- [ ] All colors defined as semantic CSS custom properties
- [ ] Light and dark values defined for every semantic token
- [ ] Dark mode toggles `.dark` class on `<html>`, not per-component `dark:` overrides
- [ ] System preference respected as default (`prefers-color-scheme`)
- [ ] Theme preference persisted in `localStorage`
- [ ] Body text contrast ≥ 4.5:1 in both modes
- [ ] UI component contrast ≥ 3:1 in both modes
- [ ] No pure black backgrounds — use gray-950
- [ ] Color never the sole indicator of meaning — always paired with icon or text
- [ ] Status colors (success, warning, info) defined as semantic tokens, not inline colors
- [ ] Hover, focus, active, disabled states consistent across all interactive elements
- [ ] Both light and dark modes tested for every UI state
