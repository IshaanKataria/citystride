---
name: responsive-layout
description: Use when building layouts that must work across mobile, tablet, and desktop — covers mobile-first breakpoints, responsive grids, collapsible navigation, fluid typography, responsive tables, and container queries with Tailwind CSS.
version: "1.0.0"
tags: [responsive, layout, grid, breakpoints, mobile, css]
related: [design-tokens, ui-accessibility]
---

## What This Skill Covers

Mobile-first design with Tailwind CSS. Start with the smallest screen, add complexity at larger breakpoints. Every layout must be functional at 320px.

## Rules & Patterns

### Breakpoint Strategy

#### Standard Breakpoints

| Name | Min Width | Tailwind Prefix | Target |
|---|---|---|---|
| Base | 0px | (none) | Mobile phones |
| `sm` | 640px | `sm:` | Large phones / small tablets |
| `md` | 768px | `md:` | Tablets |
| `lg` | 1024px | `lg:` | Small desktops |
| `xl` | 1280px | `xl:` | Desktops |
| `2xl` | 1536px | `2xl:` | Wide screens |

#### Mobile-First Rule

Write base styles for mobile. Add breakpoint prefixes to WIDEN, never to shrink.

```tsx
// GOOD — mobile-first, adds columns at larger sizes
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// BAD — desktop-first, removes columns on mobile
<div className="grid grid-cols-3 md:grid-cols-2 sm:grid-cols-1 gap-4">
```

### Core Patterns

#### 1. Responsive Grid

```tsx
// Dashboard card grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {cards.map((card) => (
    <Card key={card.id}>{/* ... */}</Card>
  ))}
</div>
```

#### 2. Collapsible Sidebar Navigation

```tsx
// Sidebar: hidden on mobile, visible on desktop
<aside className="hidden lg:block lg:w-64 lg:shrink-0">
  <nav>{/* full sidebar nav */}</nav>
</aside>

// Mobile: hamburger menu with Sheet
<div className="lg:hidden">
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="ghost" size="icon" aria-label="Open menu">
        <MenuIcon />
      </Button>
    </SheetTrigger>
    <SheetContent side="left">
      <SheetTitle>Navigation</SheetTitle>
      <nav>{/* same nav items */}</nav>
    </SheetContent>
  </Sheet>
</div>
```

#### 3. Responsive Data Table → Card Layout

Tables on mobile are unreadable. Switch to card layout below `md`.

```tsx
// Desktop: table
<div className="hidden md:block">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map((item) => (
        <TableRow key={item.id}>
          <TableCell>{item.name}</TableCell>
          <TableCell><Badge>{item.status}</Badge></TableCell>
          <TableCell>{/* actions */}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>

// Mobile: card layout
<div className="md:hidden flex flex-col gap-3">
  {items.map((item) => (
    <Card key={item.id}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="font-medium">{item.name}</p>
          <Badge className="mt-1">{item.status}</Badge>
        </div>
        {/* actions */}
      </CardContent>
    </Card>
  ))}
</div>
```

#### 4. Responsive Typography

Use Tailwind's responsive text sizes. Don't use `clamp()` or viewport units for body text.

```tsx
// Headings scale with breakpoint
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
  Dashboard
</h1>

// Body text stays readable
<p className="text-sm md:text-base">
  Content paragraph
</p>
```

#### 5. Responsive Spacing

Scale padding and gaps at breakpoints, not with arbitrary calc().

```tsx
// Page container
<main className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
  {/* content */}
</main>

// Section spacing
<section className="flex flex-col gap-4 md:gap-6 lg:gap-8">
  {/* sections */}
</section>
```

#### 6. Responsive Stack → Row

Vertical on mobile, horizontal on desktop.

```tsx
// GOOD — flex-col by default, row at md
<div className="flex flex-col md:flex-row gap-4">
  <div className="md:w-1/3">{/* sidebar content */}</div>
  <div className="md:w-2/3">{/* main content */}</div>
</div>
```

#### 7. Container Queries (Tailwind v4)

When a component's layout depends on its container width, not the viewport.

```tsx
// Parent marks the container
<div className="@container">
  {/* Child responds to container width */}
  <div className="flex flex-col @md:flex-row gap-4">
    <img className="w-full @md:w-48" />
    <div>{/* text content */}</div>
  </div>
</div>
```

Use container queries for reusable components that appear in different-width contexts (sidebar cards vs. main content cards).

### 1. Touch Targets — 44px Minimum

All interactive elements must be at least 44x44px on touch devices.

```tsx
// GOOD — adequate touch target
<Button size="default">{/* 40px height minimum */}</Button>
<button className="min-h-11 min-w-11 p-2">{/* 44px */}</button>

// BAD — tiny touch target
<button className="p-1 text-xs">{/* too small */}</button>
```

### 2. No Horizontal Scroll

Content must not cause horizontal scrolling at any breakpoint.

```tsx
// GOOD — constrained width, overflow handled
<div className="max-w-full overflow-x-auto">
  <Table>{/* wide table scrolls within container */}</Table>
</div>

// BAD — fixed-width element breaks mobile
<div className="w-[800px]">{/* forces horizontal scroll */}</div>
```

### 3. Images Are Fluid

```tsx
// GOOD — responsive image
<img className="w-full h-auto max-w-full" alt="..." />

// BAD — fixed dimensions
<img className="w-[600px] h-[400px]" alt="..." />
```

### 4. Content Priority on Mobile

Show the most important content first on mobile. Secondary actions and metadata can be hidden or collapsed.

```tsx
// Secondary info hidden on mobile
<span className="hidden sm:inline text-muted-foreground">
  Last updated 3 hours ago
</span>
```

## Anti-Patterns

1. **Desktop-first styling** — writing `grid-cols-3` then overriding down. Start mobile, add up.
2. **`px` media queries in CSS** — use Tailwind breakpoint prefixes, not custom `@media` queries.
3. **Fixed-width containers** — `w-[1200px]` breaks on anything smaller. Use `max-w-*` with `w-full`.
4. **Hiding content with `display: none` as primary strategy** — build a mobile layout, not a hidden desktop layout.
5. **Viewport units for text** — `text-[3vw]` is unreadable at extremes. Use responsive text classes.
6. **Ignoring landscape mobile** — test at 568x320 (iPhone landscape), not just 375x812.

## Checklist

- [ ] All layouts start mobile-first — base styles for 320px
- [ ] Breakpoint prefixes only add complexity (never subtract)
- [ ] Grid switches from 1 column to 2-3-4 at appropriate breakpoints
- [ ] Navigation collapses to hamburger/sheet on mobile
- [ ] Data tables switch to card layout on mobile
- [ ] Typography scales at breakpoints — headings larger on desktop
- [ ] Touch targets are 44px minimum
- [ ] No horizontal scrolling at any breakpoint
- [ ] Images are fluid with `w-full h-auto`
- [ ] Spacing scales with breakpoints (`gap-4 md:gap-6 lg:gap-8`)
- [ ] Secondary content hidden or collapsed on mobile
- [ ] Tested at 320px, 768px, 1280px, and 1536px widths
