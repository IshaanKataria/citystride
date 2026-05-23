---
name: coding-practices
description: Use when writing or reviewing code in any language or framework. Foundational engineering standards for code style, naming, SOLID principles, error handling, dependency injection, type safety, and agentic code design that all other skills inherit from.
version: "1.0.0"
tags: [coding, standards, solid, naming, errors, di, types]
related: []
---

## What This Skill Covers

Universal engineering standards that apply to every language, framework, and project in this organization. This is the foundational skill — all language and framework skills depend on it. It enforces:

- Code style, structure, and method ordering
- Naming conventions and self-documenting code
- SOLID, DRY, and YAGNI principles
- Type safety as a non-negotiable default
- Error handling with specific exceptions
- Guard clauses and early returns
- Dependency injection over static coupling
- Refactoring patterns (Composed Method, Extract Method, Replace Temp with Query)
- Boy Scout Rule — leave code cleaner than you found it
- Agentic/AI-first code design — code that is easy for both humans and AI agents to read, navigate, and modify

Every skill in this platform inherits these rules. Language-specific skills may extend or adapt them but never contradict them.

### Quick Reference

| # | Rule | Theme |
|---|---|---|
| 1 | Method ordering by visibility (static > fields > ctor > public > protected > private) | Structure |
| 2 | Group related lines into logical paragraphs separated by one blank line | Structure |
| 3 | Descriptive, intention-revealing names; no abbreviations | Naming |
| 4 | Code as documentation — no inline comments, only WHY comments and public API docstrings | Naming |
| 5 | Explicit type annotations on all parameters, return values, and non-trivial variables | Type Safety |
| 6 | SOLID principles — Single Responsibility, Open/Closed, Liskov, Interface Segregation, DI | Design |
| 7 | DRY but not prematurely — rule of three before extracting | Design |
| 8 | YAGNI — no speculative abstractions or unused feature flags | Design |
| 9 | Named constants for every meaningful literal; no magic values | Clarity |
| 10 | Specific exception classes with structured context; never return -1 or generic strings | Error Handling |
| 11 | Guard clauses and early returns; max two levels of nesting | Error Handling |
| 12 | Class-based architecture for stateful behavior; free functions for stateless transforms | Architecture |
| 13 | Dependency injection via constructors; no utils/helpers/common dumping grounds | Architecture |
| 14 | Composed Method — each method at a single level of abstraction | Refactoring |
| 15 | Extract Method immediately when a block has a clear purpose | Refactoring |
| 16 | Replace Temp with Query — name computations, eliminate intermediates | Refactoring |
| 17 | Boy Scout Rule — leave code cleaner, proportional to the change | Discipline |
| 18 | Twelve-Factor App — config in env, backing services as URLs, logs to stdout | Config |
| 19 | Secrets in environment variables; validate at startup; .env in .gitignore | Config |
| 20 | No environment-specific branching in app code; one code path, fail loudly | Config |
| 21a | Package hygiene — check maintenance, audit security, pin versions, minimize deps | Dependencies |
| 21b | No loose strings — all user-facing text from i18n/translation files | i18n |
| 22 | Structured error codes, not freeform string messages; resolve at presentation layer | Error Handling |
| 23 | Agentic code design — explicit, consistent, small files, rich types, descriptive names | Agentic |

## Rules & Patterns

### 1. Method Ordering by Visibility

Organize class/module members in this order:
1. Constants and static fields
2. Instance fields (explicitly declared with types)
3. Constructor(s)
4. Public methods
5. Protected methods
6. Private methods

Related methods may be grouped within their visibility section. This ordering lets a reader understand the public API of a class without scrolling past implementation details.

### 2. Code Grouping and Spacing

Group lines that perform a single logical operation together as a "paragraph." Separate paragraphs with one blank line. Do not add blank lines between every statement — that destroys visual grouping. Do not omit all blank lines — that creates a wall of text.

A method body should read like a short essay: setup, action, result — each separated by whitespace.

### 3. Naming Conventions

Use descriptive, intention-revealing names. The name should answer: what does this represent, and why does it exist?

| Element | Convention | Example |
|---|---|---|
| Function/method | verb + noun, language idiom | `calculateAnnualRevenue`, `calculate_annual_revenue` |
| Boolean | is/has/can/should prefix | `isActive`, `hasPermission`, `canRetry` |
| Collection | plural noun | `users`, `orderItems`, `failedAttempts` |
| Constant | UPPER_SNAKE or language idiom | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS` |
| Class/type | PascalCase noun | `OrderService`, `PaymentGateway` |
| Interface | describes capability | `Serializable`, `EventHandler`, `Repository` |

Never abbreviate unless the abbreviation is universally understood (`id`, `url`, `http`). `calculate_annual_revenue` not `calc_ann_rev`. `getUserById` not `getUBI`.

### 4. Code as Documentation — No Comments in Logic

The code itself must be self-documenting through clear naming and small methods. Comments inside method bodies indicate the code is not clear enough — fix the code, not the symptom.

**Where documentation IS required:**
- Public API docstrings (classes, public methods, exported functions) — these provide context for humans and AI agents
- Module-level documentation explaining purpose and boundaries
- `WHY` comments for non-obvious business rules or workarounds (never `WHAT` comments)

**Where documentation is NOT allowed:**
- Inline comments restating what code does (`// increment counter` above `counter++`)
- Commented-out code (delete it — version control exists)
- TODO/FIXME without a linked issue number

### 5. Type Safety as Default

Every function parameter, return value, and variable where the type is not trivially inferable must have an explicit type annotation. This is non-negotiable across all typed languages.

- Prefer custom domain types over generic primitives (`UserId` over `string`, `Percentage` over `number`)
- Prefer specific collection types (`ReadonlyMap<UserId, User>` over `object`)
- Never silence the type checker with escape hatches (`any`, `Object`, `interface{}`) without a documented reason

### 6. SOLID Principles

**Single Responsibility**: A class/module has one reason to change. If you describe what it does with "and," split it.

**Open/Closed**: Extend behavior through composition, interfaces, and strategy patterns — not by modifying existing code.

**Liskov Substitution**: Subtypes must be substitutable for their base types without altering correctness. If overriding a method changes the contract, the inheritance is wrong.

**Interface Segregation**: Prefer small, focused interfaces. A client should not depend on methods it does not use.

**Dependency Inversion**: High-level modules depend on abstractions, not concrete implementations. Inject dependencies through constructors, not through imports of concrete classes.

### 7. DRY — But Not Prematurely

Duplication is acceptable when:
- Two pieces of code look the same today but serve different domains and will diverge
- Extracting a shared abstraction would create coupling between unrelated modules

Duplication is NOT acceptable when:
- The same business rule is expressed in multiple places
- A change to one copy requires hunting down and updating others

Rule of three: tolerate two copies, extract on the third.

### 8. YAGNI — No Speculative Abstraction

Do not build for hypothetical future requirements. No feature flags for features that don't exist. No plugin architectures for one implementation. No configuration for things that have one value.

Three similar lines of code are better than a premature abstraction. Extract when you have a concrete, immediate need.

### 9. Constants — No Magic Values

Every literal value that carries meaning must be a named constant. Group related constants into enums or const objects. A reader should never encounter a number or string in business logic and wonder "what does this mean?"

Exception: `0`, `1`, `-1`, `true`, `false`, empty string, and `null` when their meaning is obvious from context.

### 10. Error Handling — Specific Exceptions, Never Strings

Create specific exception/error classes for each failure domain. Never return `null`, `-1`, or a generic error string to indicate failure. Never catch all exceptions silently.

Error types should carry structured context: what failed, why, and what the caller can do about it.

### 11. Guard Clauses and Early Returns

Validate preconditions at the top of a function and return/throw immediately. This eliminates nesting and makes the "happy path" the main body of the function at the lowest indentation level.

A function with more than two levels of nesting is a refactoring candidate.

### 12. Class-Based Architecture for State

When managing state and behavior together, prefer classes with explicit dependencies injected through the constructor. Free functions are appropriate for stateless transformations. Avoid global/module-level mutable state.

### 13. Dependency Injection over Static Coupling

Never import and instantiate a dependency inline. Accept dependencies through the constructor (or function parameters for stateless functions). This enables testing, swapping implementations, and reasoning about what a module needs.

Never create a `utils.py`, `helpers.ts`, or `common.go` file. These become dumping grounds. Create specific, named service classes with focused responsibilities.

### 14. Composed Method Pattern

Every method should operate at a single level of abstraction. If a method mixes high-level orchestration with low-level detail, extract the detail into a private method with a descriptive name. The parent method should read like a sequence of steps.

### 15. Extract Method — Refactor Immediately

When a block of code inside a method has a clear purpose, extract it into its own method immediately. Do not leave it with a comment saying "this part does X" — make it a method called `doX()`.

### 16. Replace Temp with Query

When a temporary variable exists only to hold a computed value used once, replace it with a method/function call. This gives the computation a name, makes it reusable, and eliminates intermediate state.

Exception: keep temps when the computation is expensive and called in a loop, or when the temp significantly improves readability of a complex expression.

### 17. Boy Scout Rule

Every time you touch a file, leave it cleaner than you found it. Rename an unclear variable. Extract a method. Remove dead code. Small, incremental improvements compound into a clean codebase.

Do NOT do a full-scale refactor when making a small change. The improvement should be proportional to the change.

### 18. Twelve-Factor App Principles

All applications follow the [twelve-factor methodology](https://12factor.net). The most impactful factors enforced here:

- **Config in environment**: All configuration that varies between environments (secrets, URIs, feature toggles) lives in environment variables. Never hardcode connection strings, API keys, or environment-specific values.
- **Database URIs as complete connection strings**: Database connections are always a single `DATABASE_URL` (or `MONGO_URI`, `REDIS_URL`, etc.) environment variable containing the full connection string — protocol, credentials, host, port, database name, and query params. Never split into separate `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` variables.
- **Backing services as attached resources**: Databases, caches, queues, and external APIs are accessed via URLs injected at deploy time. Swapping a local Postgres for an RDS instance requires only a URL change.
- **Dev/prod parity**: Development environments mirror production as closely as possible. Same database engine, same message broker, same runtime version.
- **Logs as event streams**: Applications write structured logs to stdout. Log aggregation is an infrastructure concern, not an application concern.
- **Disposability**: Processes start fast and shut down gracefully. Handle SIGTERM, drain connections, finish in-flight work.

### 19. Environment Variables for Secrets

All secrets (API keys, tokens, database credentials, signing keys) are provided via environment variables. Never commit secrets to version control. Never read secrets from config files checked into the repo.

Use `.env` files for local development only. They must be in `.gitignore`. Production secrets come from the deployment platform's secret manager (AWS SSM, GCP Secret Manager, Vault, etc.).

Validate all required environment variables at application startup. Fail fast with a clear error message listing which variables are missing.

### 20. No Environment-Specific Code in Application Logic

Never write `if (isDev)`, `if (process.env.NODE_ENV === "development")`, or any branching logic that changes runtime behavior based on environment inside business logic or infrastructure initialization. This includes:

- Conditional SDK initialization (e.g., "use emulator locally, real SDK in prod")
- Hardcoded fallback values that silently activate local/test modes (e.g., `?? "my-project-dev"`)
- Feature flags that default to a local-only path when an env var is missing

**Why this is dangerous:** If a required environment variable is accidentally omitted in production, the code silently falls back to the local/dev path — connecting to an emulator, a test database, or a no-op service — and the system appears to work while operating on the wrong infrastructure.

**The rule:** Application code always runs in production mode. Environment variables configure *where* production resources are (credentials, endpoints, project IDs) — they never switch between fundamentally different code paths. Use the platform's official production SDK initialization with no local fallbacks.

**Config files are the only exception.** Tooling configs (`vite.config.ts`, `vitest.config.ts`, `Dockerfile`) may reference `NODE_ENV` to change build behavior. Application code — business logic, service clients, SDK initialization — must not.

```typescript
// BAD: silent fallback to dev/emulator mode if env var is missing
if (process.env.SERVICE_ACCOUNT_JSON) {
  initializeApp({ credential: cert(JSON.parse(process.env.SERVICE_ACCOUNT_JSON)) });
} else {
  initializeApp({ projectId: process.env.PROJECT_ID ?? "my-app-dev" }); // DANGEROUS
}

// GOOD: one initialization path, fails loudly if misconfigured
initializeApp(); // uses Application Default Credentials — same in dev and prod
```

Validate all required environment variables at startup (Rule 19). A missing variable must crash loudly, never silently degrade.

### 21. Package Hygiene and Security

Before adding any dependency:
1. **Check maintenance status**: The package must have been updated within the last 12 months. Abandoned packages are a liability.
2. **Check download count and community**: Prefer well-known packages with active communities over obscure alternatives.
3. **Run a security audit**: After installation, run the language's audit tool (`npm audit`, `pip audit`, `go vuln check`). Fix or document any findings before merging.
4. **Pin versions**: Use exact versions or lockfiles. Never use `*` or `latest` as a version specifier.
5. **Minimize dependencies**: Every dependency is a supply chain risk. If the functionality is simple (10-20 lines), write it yourself.

### 21. No Loose Strings in Application Code

All user-facing text must come from a translation/i18n library. No string literals for labels, messages, errors shown to users, tooltips, or placeholders in application code.

Organize translation files by domain and page:
```
locales/
  en/
    common.json        # shared across pages
    auth.json          # login, signup, password reset
    dashboard.json     # dashboard-specific
    orders.json        # order management
```

Reference keys in code, never raw text: `t("orders.status.shipped")` not `"Shipped"`. This enables localization, ensures consistency, and makes text changes a data concern instead of a code change.

Exception: log messages, developer-facing error messages, and test assertions may use inline strings.

### 22. Structured Error Codes — No Loose String Messages

All error classes must use structured error codes, not freeform string messages. Error codes are constants that can be looked up, translated, and programmatically handled. The human-readable message is derived from the code, never hardcoded at the throw site.

```
Error code:    "PAYMENT_DECLINED"
Error context: { amount: 100, currency: "USD", reason: "insufficient_funds" }
Message:       Resolved at the presentation layer from code + context
```

This applies to both backend error responses and frontend error handling. API errors return codes, not messages. The client resolves the code to a user-facing string via the translation system.

### 23. Agentic Code Design

Code in this organization is read and modified by both humans and AI agents. Write code that is agent-friendly:

- **Explicit over implicit**: No hidden conventions, no "you just have to know" patterns. If a pattern exists, it should be discoverable from the code structure.
- **Consistent file structure**: Same type of code lives in the same place across all projects. Agents navigate by pattern.
- **Small files, focused modules**: Large files are expensive for agents to process. Keep files under 300 lines. One export per file when practical.
- **Typed everything**: Types are the primary way agents understand code. The richer the types, the better the agent output.
- **Descriptive names over abbreviations**: Agents use names to infer intent. `calculateShippingCost` tells an agent what to modify; `calcSC` does not.

## Examples

See [examples.md](./examples.md) for detailed before/after code comparisons covering:
- Guard clauses and early returns
- Composed method pattern
- Specific error classes
- Dependency injection vs static coupling
- Replace temp with query

## Anti-Patterns

- **God Class / God File** — A single class handling HTTP, database, email, validation, and formatting. Violates Single Responsibility and makes isolated testing impossible. Extract each responsibility into its own class with a focused interface.
- **Utils/Helpers Dumping Ground** — Files named `utils.py`, `helpers.ts`, or `common.go` that accumulate unrelated functions. No cohesion, no ownership. Create specific, named service classes (`DateFormatter`, `SlugGenerator`, `PriceCalculator`).
- **Boolean Parameters that Change Behavior** — Methods like `get_users(include_inactive: bool, format_json: bool)` produce unreadable call sites and signal dual responsibility. Split into separate methods or use an enum/options object.
- **Catching All Exceptions Silently** — Bare `except Exception: pass` or `catch (e) {}` swallows programming bugs, OOM errors, and corrupts state. Catch specific exceptions, log unexpected ones with full context.
- **Stringly-Typed Code** — Using raw `string` where a finite set of values exists (roles, statuses). Typos become runtime bugs. Use enums, union types, or branded types.
- **Deep Nesting Instead of Guard Clauses** — Validation wrapped in 3-4 levels of `if` nesting, burying the happy path. Use guard clauses that return/throw early to keep the main logic flat.
- **Environment-Specific Branching** — Writing `if (isDev)` or silent fallbacks to emulator mode when an env var is missing. Application code must always run in production mode; missing variables must crash loudly.
- **Magic Numbers and Strings** — Literal values like `86400`, `"pending"`, or `0.15` scattered through business logic. Extract every meaningful literal into a named constant.

See [examples.md](./examples.md) for detailed before/after code comparisons.

## Checklist

- [ ] Class methods are ordered: static fields, instance fields, constructor, public, protected, private
- [ ] Code is grouped into logical paragraphs with single blank line separators
- [ ] All names are descriptive and intention-revealing — no abbreviations
- [ ] No inline comments restating what code does — only `WHY` comments for non-obvious rules
- [ ] All function parameters and return types have explicit type annotations
- [ ] Domain concepts use custom types, not raw primitives
- [ ] No `utils`, `helpers`, or `common` files — every module has a focused responsibility
- [ ] Error handling uses specific exception classes with structured error codes — no loose string messages
- [ ] Guard clauses at the top of functions — no more than 2 levels of nesting
- [ ] Dependencies are injected through constructors, not imported/instantiated inline
- [ ] Each method operates at a single level of abstraction (Composed Method Pattern)
- [ ] No magic numbers or strings — all meaningful values are named constants
- [ ] Boolean parameters are replaced with separate methods or option objects
- [ ] Temporary variables that hold a single computation are replaced with query methods
- [ ] No speculative abstractions — code solves the current requirement only (YAGNI)
- [ ] Files are under 300 lines; classes have a single responsibility
- [ ] Public APIs have docstrings; internal logic has none (self-documenting code)
- [ ] Code left cleaner than found (Boy Scout Rule) — proportional to the change made
- [ ] All config and secrets come from environment variables — nothing hardcoded
- [ ] Database URIs are single complete connection strings, not split variables
- [ ] No loose strings in UI code — all user-facing text from i18n/translation files
- [ ] New dependencies checked for maintenance status, security audit run post-install
- [ ] Application validates all required environment variables at startup
- [ ] No environment-specific branching in application code — one code path, configured by env vars, fails loudly if misconfigured
