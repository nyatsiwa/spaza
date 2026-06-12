// ─── SELLER PLANS (payment-processor agnostic) ───────────────────────────────
// Moved out of lib/payfast.ts so plan/commission logic no longer depends on any
// payment provider. Paystack (and anything else) imports from here.

export const SELLER_PLANS = {
  free: {
    name:            'Free',
    amount_cents:    0,         // R0.00 — no subscription payment
    commission:      0.08,      // 8%
    listing_limit:   5,
    photo_limit:     2,
    payout_schedule: 'biweekly',
  },
  growth: {
    name:            'Growth',
    amount_cents:    7000,      // R70.00 / month
    commission:      0.05,      // 5%
    listing_limit:   10,
    photo_limit:     3,
    payout_schedule: 'biweekly',
  },
} as const

export type SellerPlan = keyof typeof SELLER_PLANS

// ─── VAT ─────────────────────────────────────────────────────────────────────
// South African VAT rate. Kept here so there's one place to change it.
export const VAT_RATE = 0.15

/** Ex-VAT (net) value of a VAT-inclusive amount. */
export function exVat(inclCents: number): number {
  return Math.round(inclCents / (1 + VAT_RATE))
}

/** The VAT portion of a VAT-inclusive amount. */
export function vatPortion(inclCents: number): number {
  return inclCents - exVat(inclCents)
}

// ─── COMMISSION ──────────────────────────────────────────────────────────────
/**
 * Commission on a single product line.
 * - Non-VAT seller: commission on the full listed price.
 * - VAT-registered seller: commission on the EX-VAT (net) value, per the agreed
 *   rule (listed price is VAT-inclusive; price ÷ 1.15 is the net the seller earns).
 * The seller always receives (listed price − commission); a VAT-registered seller
 * handles their own VAT to SARS out of that.
 */
export function calculateCommission(
  amountCents: number,
  plan: SellerPlan | string,
  isVatRegistered = false
) {
  const planConfig = SELLER_PLANS[plan as SellerPlan] ?? SELLER_PLANS.free
  const rate = planConfig.commission
  const commissionBase = isVatRegistered ? exVat(amountCents) : amountCents
  const commissionCents = Math.round(commissionBase * rate)
  const payoutCents = amountCents - commissionCents
  return { commissionCents, payoutCents, rate }
}

// ─── ORDER SPLIT (Spaza pays Courier Guy; VAT only on delivery) ──────────────
/**
 * Single source of truth for how a per-seller order's money is split.
 *
 * Model:
 *   - Product price is what the buyer pays the seller for goods.
 *   - Spaza commission comes off the product (ex-VAT base if the seller is VAT-
 *     registered).
 *   - Delivery carries 15% VAT (Courier Guy's). Spaza collects it and pays the
 *     courier, so the whole delivery-incl-VAT amount stays with Spaza.
 *
 * Returns every figure an order/accounting row needs, plus the Paystack
 * `transaction_charge` (the flat amount that stays with the Spaza main account;
 * the seller subaccount gets the rest).
 */
export function computeOrderSplit(opts: {
  productCents: number          // total product price for this seller's items (VAT-inclusive if registered)
  plan: SellerPlan | string
  isVatRegistered?: boolean
  deliveryExVatCents: number    // delivery base, excluding VAT
}) {
  const { productCents, plan, isVatRegistered = false, deliveryExVatCents } = opts

  const { commissionCents, payoutCents, rate } = calculateCommission(
    productCents,
    plan,
    isVatRegistered
  )

  const deliveryVatCents = Math.round(deliveryExVatCents * VAT_RATE)
  const deliveryInclCents = deliveryExVatCents + deliveryVatCents

  // Buyer pays product + delivery (incl VAT)
  const totalCents = productCents + deliveryInclCents

  // Seller receives product − commission (their subaccount)
  const sellerAmountCents = payoutCents

  // Spaza keeps commission + delivery incl VAT (main account) → pays courier
  const spazaAmountCents = commissionCents + deliveryInclCents

  return {
    productCents,
    commissionCents,
    rate,
    sellerAmountCents,
    deliveryExVatCents,
    deliveryVatCents,
    deliveryInclCents,
    spazaAmountCents,       // == Paystack transaction_charge (flat, in cents)
    totalCents,
    sellerVatPortionCents: isVatRegistered ? vatPortion(productCents) : 0,
  }
}
