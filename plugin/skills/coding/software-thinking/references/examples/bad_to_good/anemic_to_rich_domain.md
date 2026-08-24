# Bad-to-Good Example: Anemic Model + Service → Rich Domain Model

## Scenario

A banking application calculates account fees. Logic lives entirely in a "service" while the Account entity is just a data bag. Business rules are scattered and hard to find.

## Before

```java
// Anemic "entity" — just data, no behavior
public class Account {
    private Long id;
    private String type;          // "CHECKING", "SAVINGS", "PREMIUM"
    private BigDecimal balance;
    private String status;        // "ACTIVE", "FROZEN", "CLOSED"
    private LocalDate openedDate;
    private LocalDate lastActivityDate;
    private String customerId;
    
    // Nothing but getters and setters
    public BigDecimal getBalance() { return balance; }
    public void setBalance(BigDecimal balance) { this.balance = balance; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    // ... 20 more getter/setter pairs
}

// "Service" that owns ALL the behavior
public class AccountFeeService {
    
    private final AccountRepository accountRepository;
    private final FeeConfigurationManager feeConfig;
    private final TransactionHelper transactionHelper;
    
    public BigDecimal calculateMonthlyFee(Long accountId) {
        Account account = accountRepository.findById(accountId);
        
        if (account == null) {
            throw new RuntimeException("Account not found");
        }
        
        if ("CLOSED".equals(account.getStatus())) {
            return BigDecimal.ZERO;
        }
        
        if ("FROZEN".equals(account.getStatus())) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal baseFee;
        if ("PREMIUM".equals(account.getType())) {
            baseFee = feeConfig.getPremiumBaseFee();
        } else if ("SAVINGS".equals(account.getType())) {
            baseFee = feeConfig.getSavingsBaseFee();
        } else {
            baseFee = feeConfig.getCheckingBaseFee();
        }
        
        // Waiver rules scattered here
        if (account.getBalance().compareTo(feeConfig.getMinBalanceForWaiver()) >= 0) {
            return BigDecimal.ZERO; // Balance waiver
        }
        
        if (isNewAccount(account)) {
            return BigDecimal.ZERO; // New account grace period
        }
        
        // Dormancy surcharge
        if (isDormant(account)) {
            baseFee = baseFee.add(feeConfig.getDormancySurcharge());
        }
        
        return baseFee;
    }
    
    public void chargeMonthlyFees() {
        List<Account> accounts = accountRepository.findAllActive();
        for (Account account : accounts) {
            BigDecimal fee = calculateMonthlyFee(account.getId());
            if (fee.compareTo(BigDecimal.ZERO) > 0) {
                account.setBalance(account.getBalance().subtract(fee));
                accountRepository.save(account);
                transactionHelper.recordFeeTransaction(account.getId(), fee);
            }
        }
    }
    
    private boolean isNewAccount(Account account) {
        return account.getOpenedDate().plusMonths(3).isAfter(LocalDate.now());
    }
    
    private boolean isDormant(Account account) {
        return account.getLastActivityDate().plusMonths(6).isBefore(LocalDate.now());
    }
}
```

## Thinking

### What's Wrong?

1. **Account doesn't protect itself** — anyone can `setBalance(-1000)` — no invariants
2. **Business rules are homeless** — fee logic in "service," dormancy logic in "service," waiver in "service"
3. **Account doesn't know its own rules** — is it dormant? Is it eligible for waiver? Only the service knows
4. **String-based state** — "CHECKING" vs "SAVINGS" is a type system job
5. **Data and behavior separated** — procedural programming in OO clothing

### What Business Concepts Are Hidden?

- **Account Types** (with different fee structures) — should be a type hierarchy or policy
- **Fee Waiver Rules** (balance, grace period) — should be named policies
- **Account Dormancy** — a concept the Account itself should know about
- **Monthly Fee** — a domain concept, not just a calculated number

## After

```java
// Rich domain model — Account owns its behavior and protects its invariants

public class Account {
    private final AccountId id;
    private final AccountType type;
    private final CustomerId customerId;
    private final LocalDate openedDate;
    private Money balance;
    private AccountStatus status;
    private LocalDate lastActivityDate;
    
    // Account knows its own state
    public boolean isDormant() {
        return lastActivityDate.plusMonths(6).isBefore(LocalDate.now());
    }
    
    public boolean isInGracePeriod() {
        return openedDate.plusMonths(3).isAfter(LocalDate.now());
    }
    
    public boolean isActive() {
        return status == AccountStatus.ACTIVE;
    }
    
    // Account protects its own invariants
    public void debit(Money amount, String reason) {
        if (!isActive()) {
            throw new AccountNotActiveException(id);
        }
        if (balance.isLessThan(amount) && !type.allowsOverdraft()) {
            throw new InsufficientFundsException(id, amount, balance);
        }
        balance = balance.subtract(amount);
        lastActivityDate = LocalDate.now();
    }
}

// Account type is a proper type with behavior, not a string
public enum AccountType {
    CHECKING(Money.of(10), Money.of(1500), false),
    SAVINGS(Money.of(5), Money.of(500), false),
    PREMIUM(Money.of(25), Money.of(10000), true);
    
    private final Money baseFee;
    private final Money minimumBalanceForWaiver;
    private final boolean allowsOverdraft;
    
    public Money baseFee() { return baseFee; }
    public Money minimumBalanceForWaiver() { return minimumBalanceForWaiver; }
    public boolean allowsOverdraft() { return allowsOverdraft; }
}

// Fee calculation is a named business concept — a POLICY
public class MonthlyFeePolicy {
    private static final Money DORMANCY_SURCHARGE = Money.of(5);
    
    public Money calculateFor(Account account) {
        if (!account.isActive()) return Money.ZERO;
        if (account.isInGracePeriod()) return Money.ZERO;
        if (account.balance().isAtLeast(account.type().minimumBalanceForWaiver())) {
            return Money.ZERO;
        }
        
        Money fee = account.type().baseFee();
        
        if (account.isDormant()) {
            fee = fee.add(DORMANCY_SURCHARGE);
        }
        
        return fee;
    }
}

// Application service is now THIN — just orchestration
public class MonthlyFeeCharging {
    private final AccountStore accounts;
    private final MonthlyFeePolicy feePolicy;
    
    public void chargeAllActive() {
        for (Account account : accounts.findAllActive()) {
            Money fee = feePolicy.calculateFor(account);
            if (fee.isPositive()) {
                account.debit(fee, "Monthly maintenance fee");
                accounts.save(account);
            }
        }
    }
}
```

## What Moved Where

| Logic | Before (where) | After (where) | Why |
|-------|----------------|---------------|-----|
| "Is account dormant?" | AccountFeeService (private method) | Account.isDormant() | Account knows its own state |
| "Is account in grace period?" | AccountFeeService (private method) | Account.isInGracePeriod() | Account knows its own lifecycle |
| "Can balance go negative?" | Nowhere (bug!) | Account.debit() checks type.allowsOverdraft() | Invariant enforced by owner |
| "What's the base fee?" | FeeConfigurationManager | AccountType.baseFee() | Fee is a property of account type |
| "When is fee waived?" | AccountFeeService (inline) | MonthlyFeePolicy (named concept) | Waiver rules are a named policy |
| "Charge the fee" | AccountFeeService.chargeMonthlyFees() | MonthlyFeeCharging.chargeAllActive() | Thin orchestration |

## The Principle

> **Objects should own the behavior that operates on their data.**
>
> When data lives in one place and behavior in another,
> you have procedural programming wearing an OO costume.
>
> The litmus test: can the "entity" protect its own invariants?
> If anyone can `setBalance(negative)` — it's not a domain model.
> It's a struct with ceremony.
