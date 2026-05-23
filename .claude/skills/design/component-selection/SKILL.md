---
name: component-selection
description: Use when deciding which UI component to use for a given interaction pattern — covers selection, data display, overlays, feedback, navigation, forms, and empty states with shadcn/ui and Radix UI primitives.
version: "1.0.0"
tags: [components, ui-library, radix, shadcn, headless, frontend]
related: [react, design-tokens, ui-accessibility]
---

## What This Skill Covers

Decision tables for choosing the right UI component. Use existing components before building custom markup.

## Rules & Patterns

### Selection Components

| Need | Component | When |
|---|---|---|
| Pick 1 from 6+ options | `Select` | Options list too long for inline display |
| Pick 1 from 6+ with search | `Combobox` | Large option set, user needs to filter |
| Pick 1 from 2–5 (always visible) | `RadioGroup` | User should see all options at once |
| Toggle 1 from 2–5 (compact) | `ToggleGroup` | Horizontal selector, toolbar-style |
| On/off toggle | `Switch` | Binary setting (enable notifications) |
| Multi-select (few options) | `Checkbox` group | 2-7 options, all visible |
| Multi-select (many options) | `Combobox` multi | 8+ options, searchable |

### Data Display

| Need | Component | When |
|---|---|---|
| Tabular data with columns | `Table` | Structured data, sortable/filterable |
| Key-value pairs | `Card` with description list | Profile details, settings summary |
| Status indicator | `Badge` | Inline status labels (Active, Pending, Failed) |
| User avatar | `Avatar` + `AvatarFallback` | Always include fallback for failed image loads |
| Metric/stat | `Card` with large number | Dashboard KPIs |
| List with actions | `Table` or `Card` list | Items with edit/delete per row |
| Hierarchical data | `Accordion` | Expandable sections, FAQ |
| Progress toward goal | `Progress` | Upload progress, step completion |

### Overlays

| Need | Component | When |
|---|---|---|
| Modal dialog | `Dialog` | Focused task, form, detail view |
| Destructive confirmation | `AlertDialog` | Delete, irreversible action |
| Side panel | `Sheet` | Settings, filters, detail pane |
| Bottom sheet (mobile) | `Drawer` | Mobile-first overlay |
| Small contextual popup | `Popover` | Filter controls, color picker |
| Right-click menu | `ContextMenu` | File manager, canvas actions |
| Action menu on button | `DropdownMenu` | "More actions" pattern |
| Command palette | `Command` inside `Dialog` | Global search, keyboard navigation |

**Rules for overlays:**
- `Dialog`, `Sheet`, and `Drawer` always need a `Title` component (use `sr-only` class if visually hidden)
- `AlertDialog` for destructive actions — forces user to choose, no click-outside dismiss
- `Dialog` for non-destructive — supports click-outside dismiss

### Navigation

| Need | Component | When |
|---|---|---|
| Sidebar navigation | `Sidebar` | App shell, persistent nav |
| Top-level page nav | `NavigationMenu` | Marketing site, docs |
| Breadcrumb trail | `Breadcrumb` | Deep navigation hierarchy |
| Tab-based views | `Tabs` | Switch between related views |
| Paginated content | `Pagination` | Table pages, search results |

**Tabs rules:**
- `TabsTrigger` must be inside `TabsList` — never render triggers directly in `Tabs`
- Use `Tabs` for same-page content switching, not for navigation between routes

### Forms

| Need | Component | When |
|---|---|---|
| Text input | `Input` | Single-line text, email, password |
| Multi-line text | `Textarea` | Comments, descriptions |
| Number input | `Input` with `type="number"` | Quantities, amounts |
| Date picker | `DatePicker` (Popover + Calendar) | Date selection |
| OTP / verification code | `InputOTP` | 4-6 digit codes |
| Range selection | `Slider` | Volume, price range |
| File upload | Custom with `Input type="file"` | Document upload |

**Form layout:** Use semantic form elements with proper labels. Group related fields logically. See `ui-accessibility` skill for labeling and validation patterns.

### Feedback

| Need | Component | When |
|---|---|---|
| Auto-dismissing notification | `sonner` (toast) | Success/error after action |
| Inline alert/callout | `Alert` | Page-level warnings, info banners |
| Loading placeholder | `Skeleton` | Content loading state |
| Loading spinner | `Spinner` | Action in progress |
| Empty state | `Empty` | No data, first-time experience |

**Toast rules:**
- Use `sonner` library, not custom toast components
- Success toasts auto-dismiss; error toasts require manual dismiss
- Never use toast for critical errors — use inline `Alert` instead

### Contextual Info

| Need | Component | When |
|---|---|---|
| Hover help text | `Tooltip` | Short explanation on hover/focus |
| Rich preview on hover | `HoverCard` | User profile preview, link preview |
| Inline expandable | `Collapsible` | "Show more" content |
| Visual separator | `Separator` | Between content sections |
| Resizable panels | `Resizable` | IDE-style split panes |
| Scrollable container | `ScrollArea` | Custom scrollbar styling |

### Icons

- Use the project's configured icon library (check `iconLibrary` in project config)
- Icons inside `Button` use `data-icon="inline-start"` or `data-icon="inline-end"`
- No sizing classes on icons inside components — components handle icon sizing via CSS
- Pass icons as component references, not string keys: `icon={CheckIcon}` not `icon="check"`

### Decision Flowchart

```
Need user to choose?
├── How many options?
│   ├── 2 (on/off) → Switch
│   ├── 2-5 (visible) → RadioGroup or ToggleGroup
│   ├── 6+ (dropdown) → Select
│   └── 6+ (searchable) → Combobox
│
Need to show an overlay?
├── Is it destructive? → AlertDialog
├── Is it a form/task? → Dialog
├── Is it a side panel? → Sheet
├── Is it mobile bottom? → Drawer
├── Is it small/contextual? → Popover
└── Is it a menu? → DropdownMenu or ContextMenu
│
Need to give feedback?
├── After an action? → sonner (toast)
├── Page-level warning? → Alert
├── Loading content? → Skeleton
├── No data exists? → Empty
```

## Examples

### Select vs Combobox in a Form

Use `Select` when the option list is short and static. Switch to `Combobox` when users need to search.

```tsx
// Country has 200+ options — use Combobox so users can type to filter
function ShippingForm() {
  const [country, setCountry] = useState("");
  const [priority, setPriority] = useState("");

  return (
    <form className="flex flex-col gap-4">
      <div>
        <Label htmlFor="country">Country</Label>
        <Combobox
          id="country"
          value={country}
          onValueChange={setCountry}
          options={countries}
          placeholder="Search countries..."
        />
      </div>
      <div>
        {/* Only 3 options — use Select, no search needed */}
        <Label htmlFor="priority">Shipping Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger id="priority"><SelectValue placeholder="Select priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard (5-7 days)</SelectItem>
            <SelectItem value="express">Express (2-3 days)</SelectItem>
            <SelectItem value="overnight">Overnight</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}
```

### Table vs Card Layout for Data Display

Use `Table` for structured, multi-column data that users scan horizontally. Use `Card` list when each item is a self-contained entity with a primary action.

```tsx
// Structured data with sortable columns — Table is the right choice
function UserListTable({ users }: { users: User[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.role}</TableCell>
            <TableCell><Badge variant={user.active ? "default" : "secondary"}>{user.active ? "Active" : "Inactive"}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

```tsx
// Each item is a self-contained entity with visual emphasis — Card list fits better
function ProjectCards({ projects }: { projects: Project[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader>
            <CardTitle>{project.name}</CardTitle>
            <CardDescription>{project.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge>{project.status}</Badge>
              <span className="text-sm text-muted-foreground">{project.memberCount} members</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm">Open Project</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
```

## Anti-Patterns

1. **Custom styled `<div>` when a component exists** — check the table above before writing custom markup
2. **`<div onClick>` for actions** — use `Button`, `DropdownMenuItem`, or proper interactive element
3. **Custom empty state markup** — use `Empty` component
4. **Custom toast implementation** — use `sonner`
5. **`<hr>` or `<div className="border-t">` for dividers** — use `Separator`
6. **Custom `animate-pulse` loading** — use `Skeleton`
7. **Manual active state on buttons for selection** — use `ToggleGroup`
8. **`Tabs` for page navigation** — Tabs are for in-page content switching; use router for navigation
9. **Nested interactive elements** — `<button>` inside `<a>` is invalid HTML

## Checklist

- [ ] Checked component tables above before writing custom UI
- [ ] Using `Select` or `Combobox` for 6+ options, not a list of buttons
- [ ] Using `AlertDialog` for destructive confirmations, not `Dialog`
- [ ] Using `sonner` for toasts, not custom toast component
- [ ] Using `Separator` for dividers, not `<hr>` or border divs
- [ ] Using `Skeleton` for loading states, not custom pulse animations
- [ ] Using `Badge` for status, not custom styled spans
- [ ] Using `Empty` for empty states, not custom markup
- [ ] All overlays have titles (visible or `sr-only`)
- [ ] Icons use `data-icon` attribute inside buttons, no manual sizing
