---
name: ui-accessibility
description: Use when building UI components, forms, modals, tables, or navigation — covers WCAG AA compliance, ARIA attributes, keyboard navigation, focus management, screen reader support, and color contrast requirements.
version: "1.0.0"
tags: [accessibility, a11y, aria, wcag, screen-reader, ui]
related: [react, component-selection, color-system]
---

## What This Skill Covers

Every UI component must be usable by keyboard, screen reader, and assistive technology. WCAG 2.1 AA is the minimum standard — not a nice-to-have.

## Rules & Patterns

### 1. Semantic HTML First, ARIA Second

Use the correct HTML element before reaching for ARIA. A `<button>` is always better than `<div role="button">`.

| Need | Use | Not |
|---|---|---|
| Clickable action | `<button>` | `<div onClick>` |
| Navigation | `<nav>`, `<a href>` | `<div onClick>` with router push |
| Form input | `<input>`, `<select>`, `<textarea>` | `<div contentEditable>` |
| Heading | `<h1>`–`<h6>` | `<div className="text-2xl font-bold">` |
| List | `<ul>`, `<ol>`, `<li>` | nested `<div>` |
| Table data | `<table>`, `<th>`, `<td>` | CSS grid with `<div>` |

### 2. Every Interactive Element is Keyboard Accessible

- All actions reachable via `Tab` / `Shift+Tab`
- `Enter` or `Space` activates buttons and links
- `Escape` closes modals, dropdowns, and popovers
- Arrow keys navigate within composite widgets (tabs, menus, radio groups)
- No keyboard traps — user can always Tab away

### 3. Focus Management for Modals and Overlays

When a modal/dialog opens:
1. Move focus to the first focusable element inside
2. Trap focus within the modal (Tab wraps around)
3. On close, return focus to the element that triggered the modal

```tsx
// shadcn Dialog handles this automatically
// For custom overlays, manage focus explicitly:
const triggerRef = useRef<HTMLButtonElement>(null);

const handleClose = () => {
  setOpen(false);
  triggerRef.current?.focus(); // return focus to trigger
};
```

### 4. Visible Focus Indicators — Always

Never remove focus outlines. Style them, don't hide them.

```css
/* GOOD — styled focus ring */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* BAD — removes all focus indication */
:focus { outline: none; }
```

Tailwind: use `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`.

### 5. Color Contrast — WCAG AA Minimum

| Element | Minimum Ratio |
|---|---|
| Normal text (< 18px) | 4.5:1 |
| Large text (≥ 18px or ≥ 14px bold) | 3:1 |
| UI components and icons | 3:1 |
| Decorative elements | No requirement |

Never rely on color alone to convey meaning. Add icons, text labels, or patterns alongside color.

```tsx
// GOOD — color + icon + text
<Badge variant="destructive">
  <AlertIcon data-icon="inline-start" />
  Failed
</Badge>

// BAD — color only
<span className="text-red-500">Failed</span>
```

### 6. Labels and Descriptions

Every form input needs a visible label. Every error state needs an accessible description.

```tsx
// GOOD — associated label + error description
<label htmlFor="email">Email</label>
<input id="email" aria-describedby="email-error" aria-invalid={!!error} />
{error && <p id="email-error" role="alert">{error}</p>}

// BAD — placeholder as label
<input placeholder="Enter email" />
```

For icon-only buttons, use `aria-label`:

```tsx
<button aria-label="Close dialog">
  <XIcon />
</button>
```

### 7. Live Regions for Dynamic Content

Announce dynamic changes (toasts, form validation, loading states) to screen readers.

```tsx
// Toast notifications — use role="status" or aria-live="polite"
<div role="status" aria-live="polite">
  {message}
</div>

// Urgent errors — use role="alert" (assertive)
<div role="alert">
  {errorMessage}
</div>
```

Sonner/toast libraries typically handle this. Verify they set appropriate ARIA roles.

### 8. Images and Icons

- Meaningful images: `<img alt="Description of content">`
- Decorative images: `<img alt="" role="presentation">`
- Icons with meaning: `aria-label` on the parent interactive element
- Icons inside labeled buttons: `aria-hidden="true"` on the icon

```tsx
// Icon inside a labeled button — icon is decorative
<button>
  <SearchIcon aria-hidden="true" />
  Search
</button>

// Icon-only button — needs aria-label
<button aria-label="Search">
  <SearchIcon />
</button>
```

### 9. Tables Need Headers and Captions

```tsx
<table>
  <caption className="sr-only">Monthly revenue by region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>North America</td>
      <td>$1.2M</td>
    </tr>
  </tbody>
</table>
```

For sortable columns, add `aria-sort="ascending"` or `aria-sort="descending"` to the active `<th>`.

### 10. Skip Navigation Link

Every page with repeated navigation needs a skip link as the first focusable element.

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:p-2 focus:rounded">
  Skip to main content
</a>
```

### 11. Reduced Motion

Respect `prefers-reduced-motion` for animations and transitions.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Tailwind: use `motion-reduce:` modifier for per-element control.

### 12. Component-Specific Patterns

### Modals/Dialogs
- Must have a title (`aria-labelledby` or `<DialogTitle>`)
- Hide title visually with `className="sr-only"` if not needed visually
- Trap focus, close on Escape, return focus on close

### Tabs
- `role="tablist"` on container, `role="tab"` on triggers, `role="tabpanel"` on content
- `aria-selected="true"` on active tab
- Arrow keys to switch tabs, Tab to enter panel content

### Dropdown Menus
- `role="menu"` on container, `role="menuitem"` on items
- Arrow keys to navigate, Enter to select, Escape to close
- `aria-expanded` on trigger

### Form Validation
- `aria-invalid="true"` on invalid inputs
- `aria-describedby` pointing to error message element
- Error message uses `role="alert"` for immediate announcement

## Anti-Patterns

1. **`outline: none` without replacement** — removes keyboard indication. Style it, don't remove it.
2. **`<div onClick>` for actions** — not keyboard accessible, no role. Use `<button>`.
3. **Placeholder as label** — placeholders disappear on input, invisible to some screen readers.
4. **Color-only status indicators** — red/green without text or icons. Invisible to colorblind users.
5. **Auto-playing animations** — respect `prefers-reduced-motion`.
6. **Missing modal titles** — screen readers cannot announce the dialog purpose.
7. **Nested interactive elements** — `<button>` inside `<a>` or `<a>` inside `<button>`. Invalid HTML, broken focus order.

## Checklist

- [ ] All interactive elements reachable and operable by keyboard
- [ ] Visible focus indicators on all focusable elements (`focus-visible:ring-*`)
- [ ] Modals trap focus, close on Escape, return focus to trigger
- [ ] All form inputs have visible labels (not just placeholders)
- [ ] Form errors use `aria-invalid` + `aria-describedby` + `role="alert"`
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 UI components)
- [ ] No color-only status indicators — always paired with icon or text
- [ ] Images have appropriate `alt` text (or `alt=""` for decorative)
- [ ] Dynamic content changes announced via `aria-live` or `role="status"`
- [ ] Skip navigation link present on pages with repeated nav
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Tables have `<th scope>` and `<caption>`
- [ ] Heading hierarchy is logical (`h1` → `h2` → `h3`, no skipping)
