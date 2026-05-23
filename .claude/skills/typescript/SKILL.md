---
name: typescript
description: Use when writing TypeScript code — covers strict typing, neverthrow Result types, async/await, module organization, barrel files, path aliases, and import conventions.
version: "1.0.0"
tags: [typescript, ts, types, async, modules, frontend, backend]
related: [coding-practices]
---

## What This Skill Covers

TypeScript rules for all TS projects: strict type system, branded types, discriminated unions, `neverthrow` Result types, async/await patterns, concurrency, retries, module boundaries, barrel files, path aliases, imports, class-based architecture, DI, error handling, file naming, linting, and package management.

### Quick Reference

| Category | Key Rules |
|---|---|
| Type Safety | Strict mode always, `interface` for objects / `type` for unions, never `any`, discriminated unions with `never` checks, `as const` over enums, branded types, `readonly` by default, constrained generics, type guards over assertions, explicit access specifiers, curly braces on all control flow |
| Class-Based Architecture | Classes for services/repos/controllers, constructor injection only, structured `AppError` with error codes |
| Async Patterns | `async`/`await` only (no `.then()`), `neverthrow` `Result`/`ResultAsync` instead of throwing, error boundaries at framework edges, `Promise.all`/`ResultAsync.combine` for concurrency, `AbortController` for cancellation, exponential backoff retries, no floating promises, explicit return types |
| Module Organization | One export per file, named exports only, barrel `index.ts` for public API, path aliases for absolute imports, sorted imports (ESLint enforced), `import type` for type-only imports, no circular dependencies, module boundary discipline |

## Rules & Patterns

### Type Safety

#### 1. Strict Mode Always

`tsconfig.json` must have `"strict": true`. Never disable individual strict flags.

#### 2. `interface` for Object Shapes, `type` for Everything Else

Use `interface` for objects and class contracts. Use `type` for unions, intersections, mapped types, and aliases.

#### 3. Never `any` — Use `unknown`

`any` disables type checking and propagates. Use `unknown` and narrow with type guards.

#### 4. Discriminated Unions with Exhaustive `never` Checks

Model variant states with a shared literal discriminant. Always add `default: never` in switch to catch unhandled variants at compile time.

#### 5. `as const` Objects Over Enums

Prefer `as const` objects for constant sets. Derive the type with `(typeof Obj)[keyof typeof Obj]`. Numeric enums have reverse mappings and allow invalid assignments.

#### 6. Branded Types for Domain Identifiers

Wrap primitives with a brand type to prevent mixing (`UserId` vs `OrderId`). Validate in constructor functions.

#### 7. `readonly` by Default

Arrays: `readonly T[]`. Properties: `readonly`. Parameters: `Readonly<T>`. Mutability is opt-in.

#### 8. Constrained Generics

Always constrain: `<T extends object>` not `<T>`. Narrow to the minimum required shape.

#### 9. Type Guards Over Type Assertions

Prefer `value is T` guard functions and `in` narrowing over `as` casts. Use `as` only with documented justification.

#### 10. Explicit Access Specifiers on All Class Members

Never rely on implicit `public`. Use `private readonly` for injected deps, `private` for internal state, `protected` sparingly, `public` explicitly on API methods.

#### 11. Always Use Curly Braces for Control Flow Bodies

All `if`, `else`, `for`, `while` statements must use curly braces, even for single-line bodies. Omitting braces is a source of bugs when adding a second statement.

```typescript
if (user.isActive) { return user; }
if (error) { throw error; }
```

### Class-Based Architecture & DI

#### 12. Class-Based Architecture for Backend

Services, repositories, controllers, and guards are classes with constructor-injected deps. Free functions only for pure stateless transforms.

#### 13. Constructor Injection Only

All deps injected via constructor. No service locators, no inline instantiation. NestJS `@Injectable()` manages lifecycle.

#### 14. Structured Error Classes with Error Codes

All errors extend a base `AppError` with a const error code, http status, and context object. Never throw loose strings. One error class per domain error.

```typescript
class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    public readonly context: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = this.constructor.name;
  }
}

class OrderNotFoundError extends AppError {
  constructor(orderId: string) {
    super(ErrorCode.ORDER_NOT_FOUND, 404, { orderId });
  }
}
```

### Async Patterns

#### 15. Always `async`/`await` — Never `.then()` Chains

All async code uses `async`/`await`. Never use `.then()/.catch()/.finally()` chains.

#### 16. Use `neverthrow` `Result` and `ResultAsync` — Do Not Throw

Use `neverthrow` as the primary error handling strategy. Functions return `Result<T, E>` (sync) or `ResultAsync<T, E>` (async) instead of throwing.

- **Service methods** return `ResultAsync<T, AppError>` — never throw
- **Repository methods** return `ResultAsync<T, AppError>` — wrap DB errors into typed results
- **Pure functions** return `Result<T, E>` for validation and parsing
- **Throw only at framework boundaries** (NestJS controllers, event handlers) — convert `Result` to throw there

Why `neverthrow` over throwing:
- **Type-safe errors**: Error type is in the signature. Compiler enforces handling.
- **No invisible control flow**: `Result` flows through normal return path, no stack unwinding.
- **Composable**: `andThen`, `map`, `mapErr`, `match` chain cleanly without nested try/catch.
- **No forgotten catches**: `ResultAsync<T, E>` makes error paths visible; `Promise<T>` hides them.

#### 17. Error Boundaries — Convert Result to Throw at Framework Edges

The only place `Result` is unwrapped to throw is at framework boundaries (controllers, handlers, consumers). Internal service-to-service calls pass `Result` through the chain using `andThen`, `map`, and `match`.

#### 18. Use `Promise.all` / `ResultAsync.combine` for Independent Concurrent Operations

Never `await` independent operations sequentially. Use `Promise.all` or `ResultAsync.combine` for parallel execution.

#### 19. Use `Promise.allSettled` When Partial Failure Is Acceptable

For operations where individual failures shouldn't fail the whole batch (e.g., notifications), use `Promise.allSettled` and inspect each result's `status`.

#### 20. Never `await` Inside a Loop for Independent Operations

Collect promises/ResultAsyncs first, then await them all. Exception: when operations must be sequential (migrations, rate-limited APIs).

#### 21. Use `AbortController` for Cancellation and Timeouts

Long-running async operations accept an `AbortSignal`. Use `AbortSignal.timeout(ms)` for timeouts and `AbortSignal.any()` to compose signals.

#### 22. Retry with Exponential Backoff for Transient Failures Only

Retry only on transient failures (5xx, 429, network errors). Never retry 4xx or validation errors. Use exponential backoff with jitter and a max retry count.

#### 23. No Floating Promises

Every `Promise` must be `await`ed or explicitly handled. ESLint `@typescript-eslint/no-floating-promises` must be enabled.

#### 24. Type Async Return Values Explicitly

Annotate return types as `Promise<T>` or `ResultAsync<T, E>`. Never rely on inference for public async methods.

### Module Organization

#### 25. One Export per File

Each file exports one primary thing — a class, interface, type, or function. The filename matches the export in kebab-case.

#### 26. Named Exports Only

No `export default`. Named exports enforce consistent import names and grep-ability across the codebase.

#### 27. Barrel Files (`index.ts`) — Public API Only

A barrel file re-exports the public API of a module/directory. It acts as the boundary — consumers import from the barrel, not from internal files. Only export what external consumers need.

```typescript
// src/order/index.ts — public API of the order module
export { OrderService } from "./order.service";
export { CreateOrderDto } from "./create-order.dto";
export { OrderResponseDto } from "./order-response.dto";
export type { Order } from "./order.interface";
```

#### 28. Path Aliases for Absolute Imports

Configure `paths` in `tsconfig.json` to avoid deep relative imports:

```json
{
  "compilerOptions": {
    "paths": {
      "@app/*": ["src/*"],
      "@lib/*": ["src/lib/*"],
      "@test/*": ["test/*"]
    }
  }
}
```

**When to use each:**
- **Absolute imports** (`@app/order`): for cross-module imports — importing from a different module's barrel file.
- **Relative imports** (`./order.service`): for intra-module imports — files within the same module directory importing each other.

Never use deep relative paths across module boundaries (e.g., `../../../order/order.entity`). If you need something from another module, import from its barrel via a path alias.

#### 29. Import Order (ESLint Enforced)

1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`@nestjs/common`, `neverthrow`)
3. Internal absolute (`@app/order`, `@lib/shared`)
4. Relative (`./order.service`, `../dto`)

Each group separated by a blank line. Alphabetical within groups.

#### 30. `type` Keyword for Type-Only Imports

```typescript
import type { Order } from "@app/order";
import { OrderService } from "@app/order";
```

Enforced by `@typescript-eslint/consistent-type-imports`. Type-only imports are erased at compile time and prevent accidental runtime dependencies on type-only modules.

#### 31. No Circular Dependencies

Modules must form a directed acyclic graph. If A imports B and B imports A, extract the shared type/interface into a third module that both depend on. Use `eslint-plugin-import` with `no-cycle` rule.

#### 32. Module Boundary Discipline

A module (directory with barrel file) is a unit of encapsulation:
- External consumers import from the barrel only
- Internal files import from each other directly (relative paths)
- Never reach into another module's internal files (`@app/order/order.entity` is forbidden from outside the order module)

### File Naming, Linting, ORM

#### 33. Kebab-Case File Naming

All files: `order.service.ts`, `create-order.dto.ts`, `order-not-found.error.ts`. Never camelCase, PascalCase, or snake_case filenames.

#### 34. ESLint Mandatory

`@typescript-eslint/eslint-plugin`, `eslint-plugin-import`. Rules: `no-explicit-any`, `no-unused-vars` (error), `consistent-type-imports`, `no-floating-promises`. Prettier for formatting, ESLint for correctness — no overlap.

#### 35. npm Only

`npm` exclusively. `package-lock.json` committed. `npm ci` in CI. No yarn/pnpm/bun unless explicitly specified.

#### 36. ORM Choices

- **PostgreSQL**: TypeORM, DataMapper pattern. Never Active Record.
- **MongoDB**: Mongoose with typed schemas.
Never mix ORMs in one project.

## Examples

### Example 1: Branded Types + Const Object Error Codes

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

const ErrorCode = {
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  PAYMENT_DECLINED: "PAYMENT_DECLINED",
} as const;
type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

### Example 2: neverthrow Service -> Repository -> Controller

```typescript
// Repository: wraps DB errors into ResultAsync
@Injectable()
export class TypeOrmOrderRepository implements OrderRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repository: Repository<OrderEntity>,
  ) {}

  public findById(id: string): ResultAsync<Order | null, AppError> {
    return ResultAsync.fromPromise(
      this.repository.findOne({ where: { id } }),
      (error) => new AppError(ErrorCode.DATABASE_READ_FAILED, 500, { entity: "Order", id }),
    );
  }
}

// Service: chains Results, never throws
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  public createOrder(dto: CreateOrderDto): ResultAsync<Order, AppError> {
    return this.validateOrder(dto)
      .asyncAndThen((validated) => this.inventoryService.reserve(validated.items))
      .andThen((reservation) => this.orderRepository.save(this.buildOrder(dto, reservation)));
  }

  public getOrder(id: string): ResultAsync<Order, AppError> {
    return this.orderRepository.findById(id)
      .andThen((order) =>
        order ? ok(order) : err(new AppError(ErrorCode.ORDER_NOT_FOUND, 404, { orderId: id })),
      );
  }

  private validateOrder(dto: CreateOrderDto): Result<ValidatedOrder, AppError> {
    if (dto.items.length === 0) {
      return err(new AppError(ErrorCode.ORDER_VALIDATION_FAILED, 400, { field: "items" }));
    }
    return ok({ ...dto, validatedAt: new Date() } as ValidatedOrder);
  }
}

// Controller: the ONLY place Result is unwrapped to throw
@Controller("orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  public async createOrder(@Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    const result = await this.orderService.createOrder(dto);
    return result.match(
      (order) => OrderResponseDto.fromDomain(order),
      (error) => { throw error.toHttpException(); },
    );
  }
}
```

### Example 3: Retry with Exponential Backoff

```typescript
function isTransientError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.httpStatus >= 500 || error.httpStatus === 429;
  }
  if (error instanceof TypeError || error instanceof DOMException) {
    return true; // Network errors, abort errors — assume transient
  }
  return false;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 200,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !isTransientError(error)) { throw error; }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100, 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}
```

## Anti-Patterns

1. **`any` usage** — disables type checking, propagates silently. Use `unknown` + narrowing.
2. **Unchecked type assertions** — `JSON.parse(body) as User` is unchecked. Validate first (Zod, type guard).
3. **Numeric enums** — reverse mappings, allow invalid values. Use `as const` objects.
4. **Missing exhaustive checks** — new union variants silently ignored without `default: never`.
5. **Implicit access specifiers** — internal state exposed as public API accidentally.
6. **`export default`** — inconsistent import names, breaks grep-ability.
7. **Loose string errors** — `throw new Error("not found")` is un-grepable, untranslatable, inconsistent.
8. **`utils.ts`** — dumping ground with no cohesion. Use focused, named service classes.
9. **Throwing in service methods** — `Promise<T>` hides error paths. Use `ResultAsync<T, AppError>` to make errors visible.
10. **Floating promises** — calling async without `await` silently swallows errors and makes execution order unpredictable.
11. **Sequential `await` for independent operations** — N times slower than `Promise.all` or `ResultAsync.combine`.
12. **Catching errors and returning null** — converts every error (network, auth, DB down) into "not found." Use `Result` types.
13. **Nested try/catch pyramids** — unreadable, tangles compensation logic with happy path. Use `neverthrow` chaining.
14. **Deep relative imports across modules** — `../../../user/user.entity` is fragile. Use path aliases and barrel files.
15. **Barrel files that export everything** — breaks encapsulation. Only export the public contract.
16. **No barrel file** — consumers reach into internal files; every internal rename breaks external code.

## Checklist

- [ ] `"strict": true` in tsconfig, no individual flags disabled
- [ ] No `any` — `unknown` with narrowing only
- [ ] `interface` for objects, `type` for unions/intersections/aliases
- [ ] Discriminated unions with exhaustive `never` checks
- [ ] Branded types for domain IDs
- [ ] `readonly` by default on arrays, properties, parameters
- [ ] Constrained generics (`extends`)
- [ ] Type guards preferred over `as` assertions
- [ ] Explicit access specifiers on every class member
- [ ] `private readonly` for injected dependencies
- [ ] Structured error classes with error codes — no loose strings
- [ ] `neverthrow` installed; service/repository methods return `ResultAsync<T, AppError>`
- [ ] Pure validation/parsing returns `Result<T, E>` (sync)
- [ ] `Result` unwrapped to `throw` only at framework boundaries (controllers, handlers)
- [ ] `andThen`, `map`, `mapErr`, `match` used for chaining — not manual `isOk()`/`isErr()`
- [ ] All async uses `async`/`await` — no `.then()/.catch()` chains
- [ ] Return types explicitly annotated as `Promise<T>` or `ResultAsync<T, E>`
- [ ] Independent operations use `Promise.all` or `ResultAsync.combine`
- [ ] No `await` inside loops for independent operations
- [ ] No floating promises — `@typescript-eslint/no-floating-promises` enabled
- [ ] `AbortController`/`AbortSignal` for cancellation and timeouts
- [ ] Retries: exponential backoff + jitter, transient errors only, max attempts set
- [ ] One primary export per file; filename matches export in kebab-case
- [ ] All exports are named — no `export default`
- [ ] Barrel `index.ts` exists for each module, exporting only the public API
- [ ] Path aliases configured (`@app/*`, `@lib/*`) — no deep relative imports across modules
- [ ] Absolute imports for cross-module, relative imports for intra-module
- [ ] Imports sorted: node -> external -> internal absolute -> relative (ESLint enforced)
- [ ] `type` keyword used for type-only imports (`import type { ... }`)
- [ ] No circular dependencies — `eslint-plugin-import/no-cycle` enabled
- [ ] External consumers import from barrel files only, never from internal module files
- [ ] ESLint with `@typescript-eslint` and `eslint-plugin-import`
- [ ] `npm` with `package-lock.json` committed
- [ ] TypeORM (DataMapper) for Postgres, Mongoose for MongoDB
