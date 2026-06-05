# Payments & Subscriptions — Design (PLAN ONLY, not built)

> Status: **design for review.** No real-money code, no Stripe keys, no schema
> migration has been written or run. Nothing here is live. Approve / adjust the
> pieces below and I'll implement in a follow-up.

## Goal

Let the admin sell timed access plans. A user buys a plan (Free / Plus / Pro /
custom), which grants a **credit balance** and an **expiry date** (30 / 60 /
custom days). Usage burns credits; access ends when credits run out *or* the
plan expires. Admin sets the price and the **credits-per-dollar** rate, and the
credit grant is **auto-calculated** from price × rate.

## Core concept: credits

A *credit* is an internal currency decoupled from raw provider USD so the admin
can set margin. One conversion rate governs everything:

```
creditsPerUsd          # admin-set, e.g. 1000 credits = $1.00 of provider spend
plan.priceUsd          # what the user pays the admin, e.g. $10
plan.marginMultiplier  # admin margin, e.g. 0.5  → user gets 50% of face value in usable spend
grantedCredits = round(plan.priceUsd * creditsPerUsd * plan.marginMultiplier)
```

When a request finishes, the existing `recordUsage` cost (USD) is converted to
credits and **debited**:

```
creditsSpent = ceil(costUsd * creditsPerUsd)
```

This reuses the cost we already compute in `lib/usage.ts` — no new metering.

### Auto-calculation the admin sees
When the admin types a price and picks a rate/margin, the form previews live:

```
Price $10  ·  rate 1000 cr/$  ·  margin 0.5
→ grants 5,000 credits  ≈  $5.00 of model usage  ≈  ~3.3M GPT-4o-mini tokens
```

(The token estimate uses the cheapest enabled model's price as a yardstick.)

## Tiers (admin-editable, these are defaults)

| Plan   | Price (admin sets) | Duration | Credits (auto)      | Notes |
|--------|--------------------|----------|---------------------|-------|
| Free   | $0                 | 30 days  | small fixed grant   | rate-limited, free/zero-cost models only |
| Plus   | e.g. $10           | 30 days  | priceUsd×rate×margin | all enabled models |
| Pro    | e.g. $30           | 60 days  | priceUsd×rate×margin | all models + research/voice/image |
| Custom | admin-entered      | N days   | admin-entered/auto  | one-off grants |

Each plan toggles **feature flags**: which model tiers are allowed, and whether
image-gen / deep-research / voice are enabled.

## Schema additions (Prisma — for review, not applied)

Two new models + a few `User` fields. Additive only; no data dropped.

```prisma
model Plan {
  id               String   @id @default(cuid())
  name             String                 // "Free" | "Plus" | "Pro" | custom
  priceUsd         Float    @default(0)
  durationDays     Int      @default(30)
  creditsGranted   Int      @default(0)   // auto-calculated, stored at create time
  allowedTiers     String   @default("FREE,ZERO_COST,PAID") // CSV of model tiers
  featuresJson     String?                // {"image":true,"research":true,"voice":true}
  active           Boolean  @default(true)
  createdAt        DateTime @default(now())
  subscriptions    Subscription[]
}

model Subscription {
  id            String   @id @default(cuid())
  userId        String
  planId        String?
  creditsTotal  Int                       // granted at purchase
  creditsUsed   Int      @default(0)
  startsAt      DateTime @default(now())
  expiresAt     DateTime                  // startsAt + plan.durationDays
  status        String   @default("active") // active | expired | cancelled
  paymentRef    String?                   // Stripe session/intent id (future)
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan          Plan?    @relation(fields: [planId], references: [id], onDelete: SetNull)
  @@index([userId, status])
}

// User additions:
//   creditsPerUsd   Float?   // global rate override (else a system default const)
//   activeSubId     String?  // fast lookup of current subscription
```

The existing `costCapUsd` / `capPeriod` stay as a secondary safety cap.

## Enforcement (reuses existing guards)

In `app/api/chat/route.ts`, `image/route.ts`, `research/route.ts` — one helper
call before generation, one after:

- **Before:** `assertSubscriptionActive(userId)` → throws `AuthError(402)` if no
  active sub, expired, or `creditsUsed >= creditsTotal`. Also checks the plan's
  `allowedTiers` against the model and `featuresJson` against the feature.
- **After (in `onFinish`/post-call):** `debitCredits(userId, costUsd)` →
  `creditsUsed += ceil(costUsd * creditsPerUsd)`; flips `status` to `expired`
  when exhausted.

This slots beside the current `getCapStatus` / `recordUsage` calls.

## Admin UI (new `/admin/plans` page)

- Table of plans with inline price / duration / rate / margin and the **live
  auto-calculated credit grant** preview described above.
- Per-user: assign a plan (creates a `Subscription`), grant bonus credits,
  extend expiry, or revoke. Surfaces "credits left" + "days left" per user.
- Dashboard card: active subscriptions, MRR estimate, expiring-soon list.

## User UI

- A `/billing` page: current plan, credits remaining (progress bar), expiry
  countdown, and plan cards to upgrade.
- Chat composer shows a small "X credits left" pill; soft-warns under 10%.

## Payment integration (FUTURE — needs explicit go-ahead + keys)

Two options, both deferred until you approve:

1. **Admin-managed (no gateway):** admin marks a user as paid after off-platform
   payment. Zero PCI scope, works today. Good for internal teams. **Recommended
   first step.**
2. **Stripe Checkout:** `/api/billing/checkout` creates a Checkout Session;
   a webhook (`/api/billing/webhook`) creates the `Subscription` on
   `checkout.session.completed`. Needs `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, price IDs. Real money → I will not build this without
   your explicit instruction and keys.

## Rollout plan (when approved)

1. Add schema (`Plan`, `Subscription`, `User` fields) → `prisma migrate`.
2. `lib/credits.ts`: `convertUsdToCredits`, `assertSubscriptionActive`, `debitCredits`, `grantPlan`.
3. Wire the 3 routes (chat/image/research) to assert + debit.
4. `/admin/plans` + per-user assignment UI (admin-managed mode 1).
5. `/billing` user page.
6. *(Optional, separate sign-off)* Stripe checkout + webhook.

## Open questions for you

1. **Rate:** one global `creditsPerUsd`, or per-plan? (Global is simpler.)
2. **Margin:** bake margin into the rate, or keep a separate `marginMultiplier`?
3. **Expiry vs credits:** when a plan expires with credits left — forfeit or roll over?
4. **Free tier:** monthly auto-refresh of free credits, or one-time?
5. **Start with admin-managed payments (mode 1), and add Stripe later?**
