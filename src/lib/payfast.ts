import crypto from 'crypto'

// ─── CONFIG ──────────────────────────────────────────────────
const PAYFAST_ENV = process.env.PAYFAST_ENV || 'sandbox'

export const PAYFAST_URLS = {
  sandbox: 'https://sandbox.payfast.co.za/eng/process',
  live:    'https://www.payfast.co.za/eng/process',
}

export const PAYFAST_ITN_URLS = {
  sandbox: 'https://sandbox.payfast.co.za/eng/query/validate',
  live:    'https://www.payfast.co.za/eng/query/validate',
}

// ─── PLAN PRICING (cents) ─────────────────────────────────────
export const SELLER_PLANS = {
  basic: {
    name:           'Basic',
    amount_cents:   19900,     // R199.00
    commission:     0.05,      // 5%
    listing_limit:  50,
    payout_schedule: 'weekly',
  },
  pro: {
    name:           'Pro',
    amount_cents:   69900,     // R699.00
    commission:     0.035,     // 3.5%
    listing_limit:  null,      // unlimited
    payout_schedule: 'daily',
  },
  elite: {
    name:           'Elite',
    amount_cents:   199900,    // R1,999.00
    commission:     0.025,     // 2.5%
    listing_limit:  null,
    payout_schedule: 'instant',
  },
} as const

export type SellerPlan = keyof typeof SELLER_PLANS

// ─── HELPERS ─────────────────────────────────────────────────
function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

function pfEncode(value: string): string {
  // Match PHP urlencode (which PayFast uses server-side):
  // spaces -> '+', and also encode ! ' ( ) * which encodeURIComponent leaves raw.
  return encodeURIComponent(String(value).trim())
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E')
}

function generateSignature(data: Record<string, string>, passphrase?: string): string {
  // PayFast builds the signature string from the fields in the ORDER they are
  // submitted (NOT alphabetically sorted), excluding blank values. The passphrase,
  // if set, is appended LAST. Encoding must match PHP urlencode exactly.
  const entries = Object.entries(data)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${pfEncode(v)}`)

  if (passphrase && passphrase.trim() !== '') {
    entries.push(`passphrase=${pfEncode(passphrase)}`)
  }

  const queryString = entries.join('&')
  return crypto.createHash('md5').update(queryString).digest('hex')
}

// ─── ONE-TIME PAYMENT (Checkout) ─────────────────────────────
export interface PayFastCheckoutParams {
  orderId:     string
  orderNumber: string
  amountCents: number
  buyerEmail:  string
  buyerName:   string
  itemName:    string
  itemDesc?:   string
}

export function buildCheckoutPayload(params: PayFastCheckoutParams): {
  url: string
  fields: Record<string, string>
} {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const merchantId  = process.env.PAYFAST_MERCHANT_ID!
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY!
  const passphrase  = process.env.PAYFAST_PASSPHRASE

  const rawFields: Record<string, string> = {
    merchant_id:     merchantId,
    merchant_key:    merchantKey,
    return_url:      `${appUrl}/checkout/success?order=${params.orderId}`,
    cancel_url:      `${appUrl}/checkout/cancel?order=${params.orderId}`,
    notify_url:      `${appUrl}/api/payfast/itn`,  // ITN webhook
    name_first:      params.buyerName.split(' ')[0] || '',
    name_last:       params.buyerName.split(' ').slice(1).join(' ') || '',
    email_address:   params.buyerEmail,
    m_payment_id:    params.orderId,
    amount:          formatAmount(params.amountCents),
    item_name:       params.itemName.substring(0, 100),
    item_description: (params.itemDesc || '').substring(0, 255),
    custom_str1:     params.orderId,
    custom_str2:     params.orderNumber,
  }

  // Remove blank fields so the POSTed set exactly matches the signed set.
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawFields)) {
    if (v !== '' && v !== undefined && v !== null) fields[k] = String(v).trim()
  }

  fields.signature = generateSignature(fields, passphrase)

  // ── TEMP DEBUG: expose exactly what we sign, to diagnose mismatches ──
  const dbgEntries = Object.entries(fields)
    .filter(([k, v]) => k !== 'signature' && v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`)
  if (passphrase && passphrase.trim() !== '') {
    dbgEntries.push(`passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`)
  }

  return {
    url: PAYFAST_URLS[PAYFAST_ENV as keyof typeof PAYFAST_URLS],
    fields,
    debug: {
      merchant_id: merchantId,
      has_passphrase: !!(passphrase && passphrase.trim() !== ''),
      base: dbgEntries.join('&'),
      signature: fields.signature,
    },
  }
}

// ─── SUBSCRIPTION PAYMENT (Seller Plans) ─────────────────────
export interface PayFastSubscriptionParams {
  sellerId:    string
  sellerEmail: string
  sellerName:  string
  plan:        SellerPlan
}

export function buildSubscriptionPayload(params: PayFastSubscriptionParams): {
  url: string
  fields: Record<string, string>
} {
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL!
  const merchantId  = process.env.PAYFAST_MERCHANT_ID!
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY!
  const passphrase  = process.env.PAYFAST_PASSPHRASE
  const planDetails = SELLER_PLANS[params.plan]

  // PayFast subscription billing date (1st of next month)
  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
  const billingDate = nextMonth.toISOString().split('T')[0]  // YYYY-MM-DD

  const fields: Record<string, string> = {
    merchant_id:      merchantId,
    merchant_key:     merchantKey,
    return_url:       `${appUrl}/seller/subscription/success`,
    cancel_url:       `${appUrl}/seller/subscription/cancel`,
    notify_url:       `${appUrl}/api/payfast/subscription-itn`,
    name_first:       params.sellerName.split(' ')[0] || '',
    name_last:        params.sellerName.split(' ').slice(1).join(' ') || '',
    email_address:    params.sellerEmail,
    m_payment_id:     params.sellerId,
    amount:           formatAmount(planDetails.amount_cents),
    item_name:        `Spaza ${planDetails.name} Seller Subscription`,
    item_description: `Monthly subscription for Spaza ${planDetails.name} plan`,
    custom_str1:      params.sellerId,
    custom_str2:      params.plan,
    // Recurring billing fields
    subscription_type: '1',            // 1 = recurring
    billing_date:      billingDate,
    recurring_amount:  formatAmount(planDetails.amount_cents),
    frequency:         '3',            // 3 = monthly
    cycles:            '0',            // 0 = indefinite
  }

  fields.signature = generateSignature(fields, passphrase)

  return {
    url: PAYFAST_URLS[PAYFAST_ENV as keyof typeof PAYFAST_URLS],
    fields,
  }
}

// ─── VERIFY ITN (Instant Transaction Notification) ───────────
export async function verifyITN(itnData: Record<string, string>): Promise<boolean> {
  try {
    const passphrase = process.env.PAYFAST_PASSPHRASE
    const { signature: receivedSig, ...dataWithoutSig } = itnData

    // Step 1: Reconstruct signature
    const expectedSig = generateSignature(dataWithoutSig, passphrase)
    if (expectedSig !== receivedSig) return false

    // Step 2: Validate with PayFast servers
    const validateUrl = PAYFAST_ITN_URLS[PAYFAST_ENV as keyof typeof PAYFAST_ITN_URLS]
    const postData = Object.entries(itnData)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')

    const response = await fetch(validateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postData,
    })

    const result = await response.text()
    return result === 'VALID'
  } catch {
    return false
  }
}

// ─── COMMISSION CALCULATOR ────────────────────────────────────
export function calculateCommission(amountCents: number, plan: SellerPlan) {
  const rate = SELLER_PLANS[plan].commission
  const commissionCents = Math.round(amountCents * rate)
  const payoutCents = amountCents - commissionCents
  return { commissionCents, payoutCents, rate }
}
