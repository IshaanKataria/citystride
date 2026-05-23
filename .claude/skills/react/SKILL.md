---
name: react
description: Use when building React applications — covers component patterns, Vite setup, React Router, i18n, and testing with Vitest and React Testing Library.
version: "1.0.0"
tags: [react, frontend, jsx, components, hooks, routing, ui, spa]
related: [typescript, react-state-zustand, react-openapi-fetch, design-tokens, ui-accessibility]
---

## What This Skill Covers

React component patterns, hooks, styling (Tailwind + shadcn/ui), validation (Zod), i18n, React Router v6+ routing, and testing with Vitest and React Testing Library.

## Rules & Patterns

### Component Patterns

#### Functional Arrow Components Only
All components are arrow function components with named exports. No class components, no `function` keyword for components.

```typescript
export const OrderList = (): ReactElement => {
  return <div>...</div>;
};
```

#### Props — Typed Interface, Destructured
Every component's props have a dedicated interface with `readonly` fields. Destructure in the function signature.

```typescript
interface OrderCardProps {
  readonly order: Order;
  readonly onSelect: (orderId: string) => void;
}

export const OrderCard = ({ order, onSelect }: OrderCardProps): ReactElement => {
  ...
};
```

#### Custom Hooks for All Logic
Extract all non-trivial logic into custom hooks. Components are for rendering; hooks are for behavior. A component with more than ~5 lines of logic before `return` needs a hook extraction.

#### Composition Over Prop Drilling
Use `children`, render props, and compound component patterns to avoid drilling props. For cross-cutting state, use Zustand stores or React context.

#### Memoization — Only When Measured
Do not preemptively use `useMemo`, `useCallback`, or `React.memo`. Profile first, memoize only when there is a measured performance problem.

### Styling & Theming

#### Tailwind CSS + shadcn/ui
- **Tailwind CSS** for all styling. No CSS modules, styled-components, or inline styles.
- **shadcn/ui** as the component library (copied into the project, not imported from node_modules).
- Never build custom UI primitives when shadcn provides them.

#### Theme Tokens — Always
All colors, spacing, typography, and radii reference theme tokens via Tailwind's theme config or shadcn's built-in theming. Never hardcoded hex values or pixel sizes.

```typescript
// GOOD
<div className="bg-primary text-primary-foreground rounded-md p-4">

// BAD
<div className="bg-[#3b82f6] text-white rounded-[6px] p-[16px]">
```

### Validation & i18n

#### Zod for All Validation
Use Zod for form, API response, and runtime data validation. Integrate with React Hook Form via `@hookform/resolvers/zod`. Define schemas once, derive types.

```typescript
const createOrderSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1),
  couponCode: z.string().optional(),
});

type CreateOrderFormData = z.infer<typeof createOrderSchema>;
```

#### No Loose Strings — i18n Translation Library
All user-facing text comes from `react-i18next` or equivalent. No string literals for labels, messages, errors, tooltips, or placeholders. Organize translation files by domain: `locales/en/orders.json`, `locales/en/auth.json`.

```typescript
const { t } = useTranslation("orders");
return <h1>{t("list.title")}</h1>;
```

### Project Structure

#### Vite + CSR by Default
All React projects use Vite as the build tool. Client-Side Rendering is the default. Never use SSR unless there is an explicit, documented need.

#### Feature-Based Organization
Organize by feature/domain, not by type:

```
src/
  features/
    orders/
      components/
      hooks/
      stores/
      schemas/
      index.ts
    auth/
  shared/
    components/
    hooks/
    utils/
```

#### File Naming — kebab-case
All files: `order-list.tsx`, `use-orders.ts`, `create-order.schema.ts`.

### Routing

#### Centralized Route Configuration
Define all routes in a single `router.tsx` using `createBrowserRouter`:

```typescript
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: "orders",
        element: <AuthGuard />,
        children: [
          { index: true, lazy: () => import("@/features/orders/pages/order-list.page") },
          { path: ":orderId", lazy: () => import("@/features/orders/pages/order-detail.page") },
        ],
      },
    ],
  },
]);
```

#### Layout Components via `<Outlet />`
Nested routes with layout components that render `<Outlet />`. Layouts handle shared UI; pages render inside the outlet.

#### Route Guards as Layout Wrappers
Auth and role guards are layout components that check conditions and render `<Outlet />` or redirect. Never put auth checks inside page components.

```typescript
export const AuthGuard = (): ReactElement => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
};
```

#### Lazy Loading for Feature Pages
Every feature page is lazy loaded. Only shared layouts and the shell load eagerly.

#### Thin Page Components
Pages compose feature components and handle route params. Logic lives in hooks; UI lives in feature components.

#### kebab-case Route Paths and Typed Params
All URL paths use kebab-case: `/order-history`, `/payment-methods`. Define and validate route param types — never use unvalidated `useParams()` results directly. Use `useNavigate` for programmatic navigation, never `window.location`.

### Testing

#### Testing Pyramid
| Layer | Tool | What it tests |
|---|---|---|
| **Unit** | Vitest | Custom hooks, utilities, Zod schemas, store logic |
| **Component** | Vitest + React Testing Library | Rendering, user interactions, hook integration |
| **API Integration** | MSW + React Testing Library | Components with mocked API responses |
| **E2E** | Playwright (separate suite) | Full user flows, black box |

#### Vitest as the Test Runner
All React projects use Vitest (not Jest). Config in `vitest.config.ts`.

#### React Testing Library — Test User Behavior
Query by accessible roles, labels, and text. Never by class names or test IDs (unless no accessible alternative).

```typescript
// GOOD
const submitButton = screen.getByRole("button", { name: /submit/i });
const nameInput = screen.getByLabelText(/name/i);

// BAD
const button = container.querySelector(".btn-primary");
const input = screen.getByTestId("name-input");
```

#### MSW for API Mocking
Use Mock Service Worker to intercept network requests. Never mock `fetch` or `axios` directly.

```typescript
const handlers = [
  http.get("/orders", () => {
    return HttpResponse.json([
      { id: "ord_1", status: "pending" },
      { id: "ord_2", status: "shipped" },
    ]);
  }),
];

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

#### `userEvent` for Interactions
Use `@testing-library/user-event` (not `fireEvent`) for realistic event simulation.

#### Test Providers Wrapper
Create a `TestProviders` component wrapping children with QueryClientProvider, i18n, Router, and Theme. Use in every `render()` call.

#### AAA Pattern — No Comments
Arrange, Act, Assert separated by blank lines. No section comments.

```typescript
it("should display order list after loading", async () => {
  render(<OrderListPage />, { wrapper: TestProviders });

  await waitFor(() => {
    expect(screen.getByText("ord_1")).toBeInTheDocument();
  });

  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});
```

#### Custom Hooks and Zod Schemas
Test hooks in isolation with `renderHook`. Unit test Zod schemas with valid and invalid inputs.

#### Test File Location
Co-located: `order-list.tsx` -> `order-list.test.tsx`. Shared test utilities in `test/utils/`.

#### Descriptive Test Names
`should display error message when order creation fails` — same convention as backend tests.

## Examples

### Feature Component with i18n, Zod, shadcn

```typescript
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

import { createOrderSchema, type CreateOrderFormData } from "../schemas/create-order.schema";
import { useCreateOrder } from "../hooks/use-create-order";

export const CreateOrderForm = (): ReactElement => {
  const { t } = useTranslation("orders");
  const { mutate: createOrder, isPending } = useCreateOrder();

  const form = useForm<CreateOrderFormData>({
    resolver: zodResolver(createOrderSchema),
  });

  const handleSubmit = form.handleSubmit((data) => {
    createOrder(data);
  });

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        placeholder={t("form.couponPlaceholder")}
        {...form.register("couponCode")}
      />
      <Button type="submit" disabled={isPending}>
        {t("form.submit")}
      </Button>
    </form>
  );
};
```

### Thin Page Component with Route Params

```typescript
export const OrderDetailPage = (): ReactElement => {
  const { orderId } = useParams<{ orderId: string }>();
  const { order, isLoading } = useOrder(orderId!);

  if (isLoading) return <PageSkeleton />;
  if (!order) return <NotFoundMessage />;

  return <OrderDetail order={order} />;
};
```

### Component Test with Vitest + React Testing Library

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateOrderForm } from "./create-order-form";
import { TestProviders } from "@/test/utils/test-providers";

describe("CreateOrderForm", () => {
  it("should submit form with valid data", async () => {
    const user = userEvent.setup();
    render(<CreateOrderForm />, { wrapper: TestProviders });

    await user.type(screen.getByLabelText(/coupon/i), "SAVE10");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/order created/i)).toBeInTheDocument();
    });
  });

  it("should display validation error for empty form", async () => {
    const user = userEvent.setup();
    render(<CreateOrderForm />, { wrapper: TestProviders });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/at least one item/i)).toBeInTheDocument();
  });
});
```

## Anti-Patterns

1. **Loose strings in JSX** — all text from i18n translation keys.
2. **Hardcoded colors/sizes** — `bg-[#3b82f6]`, `p-[16px]`. Use theme tokens.
3. **Class components** — always functional arrow components.
4. **CSS modules / styled-components** — use Tailwind + shadcn exclusively.
5. **Logic in components** — extract to custom hooks.
6. **Organizing by type** — organize by feature, not `components/`, `hooks/` at root.
7. **Building custom UI primitives** — use shadcn when it provides them.
8. **SSR by default** — CSR is the default unless explicitly justified.
9. **Auth checks inside page components** — use route guard layout wrappers.
10. **Eager loading all pages** — lazy load feature pages.
11. **Scattered route definitions** — centralize in `router.tsx`.
12. **Testing implementation details** — test what the user sees, not internal state.
13. **Mocking `fetch` directly** — use MSW to intercept at the network level.
14. **`fireEvent` for user interactions** — use `userEvent` for realistic simulation.
15. **Querying by class names or test IDs** — query by role, label, or text first.
16. **Missing test providers** — always use `TestProviders` wrapper.

## Checklist

- [ ] All components are arrow functions with named exports
- [ ] Vite + React Router, CSR by default
- [ ] Tailwind CSS + shadcn/ui for all styling and UI components
- [ ] Theme system in place — no hardcoded values
- [ ] Zod for all validation, integrated with React Hook Form
- [ ] No loose strings — all text from i18n translation files
- [ ] Feature-based file organization, kebab-case naming
- [ ] Non-trivial logic extracted into custom hooks
- [ ] Props typed with dedicated interfaces, destructured in signature
- [ ] Routes centralized in `router.tsx` with `createBrowserRouter`
- [ ] Auth/role guards as layout wrapper components
- [ ] All feature pages lazy loaded
- [ ] Page components are thin — compose features, handle route params only
- [ ] Vitest as test runner, configured in `vitest.config.ts`
- [ ] React Testing Library — query by role/label/text
- [ ] MSW for API mocking, `userEvent` for interactions
- [ ] `TestProviders` wrapper in every test render
- [ ] AAA pattern, descriptive test names, co-located test files
