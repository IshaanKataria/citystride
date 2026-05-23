# Coding Practices — Examples & Anti-Patterns

Detailed reference material for the [coding-practices skill](./SKILL.md).

## Examples

### Example 1: Guard Clauses and Early Returns

```python
# BAD: deeply nested validation
def process_order(order: Order, user: User) -> OrderResult:
    if order is not None:
        if user is not None:
            if user.is_active:
                if order.total > 0:
                    # actual logic buried 4 levels deep
                    discount = calculate_discount(user, order)
                    return OrderResult(total=order.total - discount)
                else:
                    raise InvalidOrderError("Order total must be positive")
            else:
                raise InactiveUserError(user.id)
        else:
            raise ValueError("User is required")
    else:
        raise ValueError("Order is required")
```

```python
# GOOD: guard clauses, flat structure, happy path at base indentation
def process_order(order: Order, user: User) -> OrderResult:
    if order is None:
        raise ValueError("Order is required")
    if user is None:
        raise ValueError("User is required")
    if not user.is_active:
        raise InactiveUserError(user.id)
    if order.total <= 0:
        raise InvalidOrderError("Order total must be positive")

    discount = calculate_discount(user, order)
    return OrderResult(total=order.total - discount)
```

### Example 2: Composed Method Pattern

```typescript
// BAD: single method mixing orchestration with detail
async function syncInventory(warehouse: Warehouse): Promise<SyncResult> {
  const response = await fetch(`${warehouse.apiUrl}/inventory`);
  if (!response.ok) {
    throw new WarehouseSyncError(warehouse.id, response.status);
  }
  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new WarehouseSyncError(warehouse.id, "Invalid response format");
  }
  const items: InventoryItem[] = [];
  for (const entry of raw) {
    if (typeof entry.sku === "string" && typeof entry.quantity === "number") {
      items.push({ sku: entry.sku, quantity: entry.quantity, warehouseId: warehouse.id });
    }
  }
  let updated = 0;
  let skipped = 0;
  for (const item of items) {
    const existing = await db.inventory.findBySku(item.sku);
    if (existing && existing.quantity !== item.quantity) {
      await db.inventory.update(item.sku, { quantity: item.quantity });
      updated++;
    } else {
      skipped++;
    }
  }
  return { updated, skipped, total: items.length };
}
```

```typescript
// GOOD: each method operates at one level of abstraction
async function syncInventory(warehouse: Warehouse): Promise<SyncResult> {
  const rawData = await fetchWarehouseInventory(warehouse);

  const items = parseInventoryItems(rawData, warehouse.id);

  return applyInventoryUpdates(items);
}

async function fetchWarehouseInventory(warehouse: Warehouse): Promise<unknown[]> {
  const response = await fetch(`${warehouse.apiUrl}/inventory`);
  if (!response.ok) {
    throw new WarehouseSyncError(warehouse.id, response.status);
  }

  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new WarehouseSyncError(warehouse.id, "Invalid response format");
  }

  return raw;
}

function parseInventoryItems(raw: unknown[], warehouseId: string): InventoryItem[] {
  return raw
    .filter(isValidInventoryEntry)
    .map((entry) => ({
      sku: entry.sku,
      quantity: entry.quantity,
      warehouseId,
    }));
}

function isValidInventoryEntry(entry: unknown): entry is { sku: string; quantity: number } {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as Record<string, unknown>).sku === "string" &&
    typeof (entry as Record<string, unknown>).quantity === "number"
  );
}

async function applyInventoryUpdates(items: readonly InventoryItem[]): Promise<SyncResult> {
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = await db.inventory.findBySku(item.sku);
    if (existing && existing.quantity !== item.quantity) {
      await db.inventory.update(item.sku, { quantity: item.quantity });
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped, total: items.length };
}
```

### Example 3: Specific Error Classes

```python
# BAD: generic errors with string messages
def withdraw(account_id: str, amount: float) -> float:
    account = get_account(account_id)
    if account is None:
        return -1  # What does -1 mean?
    if account.balance < amount:
        raise Exception("Not enough money")  # Which exception? What context?
    account.balance -= amount
    return account.balance
```

```python
# GOOD: specific error classes with structured context
class AccountNotFoundError(Exception):
    def __init__(self, account_id: str) -> None:
        self.account_id = account_id
        super().__init__(f"Account not found: {account_id}")


class InsufficientFundsError(Exception):
    def __init__(self, account_id: str, requested: Decimal, available: Decimal) -> None:
        self.account_id = account_id
        self.requested = requested
        self.available = available
        self.shortfall = requested - available
        super().__init__(
            f"Insufficient funds in {account_id}: "
            f"requested {requested}, available {available}"
        )


def withdraw(account_id: str, amount: Decimal) -> Decimal:
    account = get_account(account_id)
    if account is None:
        raise AccountNotFoundError(account_id)
    if account.balance < amount:
        raise InsufficientFundsError(account_id, requested=amount, available=account.balance)

    account.balance -= amount
    return account.balance
```

### Example 4: Dependency Injection vs Static Coupling

```go
// BAD: hard-coded dependency, impossible to test
type OrderService struct{}

func (s *OrderService) PlaceOrder(order Order) error {
    db := database.GetConnection()  // global singleton
    err := db.Insert("orders", order)
    if err != nil {
        return err
    }
    emailer := email.NewSMTPClient()  // hard-coded implementation
    return emailer.Send(order.UserEmail, "Order placed", formatOrderEmail(order))
}
```

```go
// GOOD: dependencies injected, testable, swappable
type OrderRepository interface {
    Insert(ctx context.Context, order Order) error
}

type Notifier interface {
    Notify(ctx context.Context, recipient string, subject string, body string) error
}

type OrderService struct {
    repo     OrderRepository
    notifier Notifier
}

func NewOrderService(repo OrderRepository, notifier Notifier) *OrderService {
    return &OrderService{repo: repo, notifier: notifier}
}

func (s *OrderService) PlaceOrder(ctx context.Context, order Order) error {
    if err := s.repo.Insert(ctx, order); err != nil {
        return fmt.Errorf("failed to persist order %s: %w", order.ID, err)
    }

    return s.notifier.Notify(ctx, order.UserEmail, "Order placed", formatOrderEmail(order))
}
```

### Example 5: Replace Temp with Query

```typescript
// BAD: temporary variables obscure intent
function generateInvoice(order: Order): Invoice {
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxRate = order.region === "EU" ? 0.20 : 0.10;
  const tax = subtotal * taxRate;
  const discount = order.coupon ? subtotal * order.coupon.percentage : 0;
  const total = subtotal + tax - discount;

  return { orderId: order.id, subtotal, tax, discount, total };
}
```

```typescript
// GOOD: query methods give computations names and make them reusable
function generateInvoice(order: Order): Invoice {
  return {
    orderId: order.id,
    subtotal: calculateSubtotal(order.items),
    tax: calculateTax(order),
    discount: calculateDiscount(order),
    total: calculateTotal(order),
  };
}

function calculateSubtotal(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function calculateTaxRate(region: string): number {
  return region === "EU" ? 0.20 : 0.10;
}

function calculateTax(order: Order): number {
  return calculateSubtotal(order.items) * calculateTaxRate(order.region);
}

function calculateDiscount(order: Order): number {
  if (!order.coupon) return 0;
  return calculateSubtotal(order.items) * order.coupon.percentage;
}

function calculateTotal(order: Order): number {
  return calculateSubtotal(order.items) + calculateTax(order) - calculateDiscount(order);
}
```

## Anti-Patterns

### 1. The God Class / God File

A single class or file that does everything: handles HTTP requests, queries the database, sends emails, formats output, and validates input.

**Why this is wrong:** Violates Single Responsibility. Changes to email formatting risk breaking database queries. Impossible to test in isolation. AI agents cannot reason about a 1000-line class with 15 responsibilities.

**Fix:** Extract each responsibility into its own class with a focused interface. Inject dependencies.

### 2. The Utils/Helpers Dumping Ground

```
utils.py         # 800 lines of unrelated functions
helpers.ts       # string formatting mixed with date math mixed with API calls
common.go        # everything that didn't fit anywhere else
```

**Why this is wrong:** No cohesion, no discoverability, no ownership. Functions in utils have no relationship to each other. When everything is a "utility," nothing is. New code gets dumped here because there's no clear home for it.

**Fix:** Create specific, named service classes (`DateFormatter`, `SlugGenerator`, `PriceCalculator`). Every function belongs to a module whose name describes its domain.

### 3. Boolean Parameters that Change Behavior

```python
def get_users(include_inactive: bool = False, format_json: bool = True) -> ...:
```

**Why this is wrong:** Boolean parameters make call sites unreadable (`get_users(True, False)` -- which is which?). They signal the method does two things depending on a flag, violating Single Responsibility.

**Fix:** Split into separate methods (`get_active_users()`, `get_all_users()`) or use an enum/options object for configuration.

### 4. Catching All Exceptions Silently

```python
try:
    process_payment(order)
except Exception:
    pass  # "it's fine"
```

**Why this is wrong:** Swallows every error, including programming bugs, out-of-memory errors, and keyboard interrupts. The system appears to work while silently losing data or corrupting state.

**Fix:** Catch specific exceptions. Log unexpected ones with full context. Never use bare `except` or `catch (e)` without handling.

### 5. Stringly-Typed Code

```typescript
function setUserRole(userId: string, role: string): void { ... }
setUserRole("usr_123", "amdin");  // typo compiles fine
```

**Why this is wrong:** Using raw strings where a finite set of values exists means the type checker cannot catch invalid values. Typos become runtime bugs. Refactoring is unsafe because you can't find all usages by type.

**Fix:** Use enums, union types, or branded types. `role: "admin" | "member" | "viewer"` catches `"amdin"` at compile time.
