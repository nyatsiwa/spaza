import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase-server'
import { computeOrderSplit, type SellerPlan } from '@/lib/commission'

interface IncomingItem {
  product_id: string
  quantity: number
}
interface CheckoutBody {
  items: IncomingItem[]
  shipping: {
    name: string
    phone?: string
    line1: string
    line2?: string
    city: string
    province: string
    postal: string
  }
}

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

// Per-seller delivery rule: free if that seller's items total >= R500, else R99 (ex-VAT).
function deliveryExVatFor(sellerSubtotalCents: number): number {
  return sellerSubtotalCents >= 50000 ? 0 : 9900
}

export async function POST(request: Request) {
  try {
    if (!PAYSTACK_SECRET) {
      return NextResponse.json(
        { error: 'Payments not configured. Add PAYSTACK_SECRET_KEY in Vercel.' },
        { status: 500 }
      )
    }

    // 1. Auth — identify the buyer (bearer token, fallback to cookie session).
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    const supabase = await createServerSupabaseClient()
    let user = (await supabase.auth.getUser()).data.user
    if (!user && token) {
      user = (await supabase.auth.getUser(token)).data.user
    }
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to check out.' }, { status: 401 })
    }
    if (!user.email) {
      return NextResponse.json({ error: 'Your account needs an email to pay.' }, { status: 400 })
    }

    const body = (await request.json()) as CheckoutBody
    const { items, shipping } = body

    if (!items?.length) {
      return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 })
    }
    if (!shipping?.name || !shipping?.line1 || !shipping?.city || !shipping?.province || !shipping?.postal) {
      return NextResponse.json({ error: 'Please complete your shipping address.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 2. Re-fetch products from DB (never trust client prices)
    const productIds = items.map(i => i.product_id)
    const { data: products, error: prodErr } = await admin
      .from('products')
      .select('id, name, price_cents, images, seller_id, sku, status')
      .in('id', productIds)
    if (prodErr || !products?.length) {
      return NextResponse.json({ error: 'Could not load products.' }, { status: 400 })
    }

    // 3. Fetch the sellers (plan, VAT status, Paystack subaccount)
    const sellerIds = [...new Set(products.map(p => p.seller_id))]
    const { data: sellers, error: sellerErr } = await admin
      .from('sellers')
      .select('id, store_name, plan, vat_number, paystack_subaccount_code')
      .in('id', sellerIds)
    if (sellerErr) {
      return NextResponse.json({ error: 'Could not load seller info.' }, { status: 400 })
    }
    const sellerById = new Map<string, any>()
    sellers?.forEach(s => sellerById.set(s.id, s))

    // 4. Build line items per seller (authoritative prices)
    type Line = {
      product_id: string; seller_id: string; product_name: string;
      product_image: string | null; sku: string | null; quantity: number;
      unit_price_cents: number; total_cents: number;
    }
    const linesBySeller = new Map<string, Line[]>()
    for (const ci of items) {
      const p = products.find(pr => pr.id === ci.product_id)
      if (!p) return NextResponse.json({ error: 'A product in your cart is no longer available.' }, { status: 400 })
      if (p.status !== 'active') return NextResponse.json({ error: `"${p.name}" is not available right now.` }, { status: 400 })
      const qty = Math.max(1, Math.floor(ci.quantity))
      const lineTotal = p.price_cents * qty
      const line: Line = {
        product_id: p.id, seller_id: p.seller_id, product_name: p.name,
        product_image: p.images?.[0] ?? null, sku: p.sku ?? null, quantity: qty,
        unit_price_cents: p.price_cents, total_cents: lineTotal,
      }
      const arr = linesBySeller.get(p.seller_id) || []
      arr.push(line)
      linesBySeller.set(p.seller_id, arr)
    }

    // Guard: every seller in the cart must have a Paystack subaccount.
    for (const sid of linesBySeller.keys()) {
      const s = sellerById.get(sid)
      if (!s?.paystack_subaccount_code) {
        return NextResponse.json(
          { error: `${s?.store_name || 'A seller'} in your cart can't accept payments yet. Please remove their items or try again later.` },
          { status: 409 }
        )
      }
    }

    // 5. Save the address back to the buyer's profile (so it's remembered)
    await admin.from('profiles').update({
      full_name: shipping.name,
      phone: shipping.phone || null,
      address_line1: shipping.line1,
      address_line2: shipping.line2 || null,
      city: shipping.city,
      province: shipping.province,
      postal_code: shipping.postal,
    }).eq('id', user.id)

    // 6. For each seller: create an order, its items, decrement stock,
    //    then initialise a Paystack transaction with the split.
    const createdOrderIds: string[] = []
    const payments: { orderId: string; orderNumber: string; sellerStore: string; authorizationUrl: string; totalCents: number }[] = []

    // helper to roll back everything created so far on any failure
    async function rollbackAll() {
      for (const oid of createdOrderIds) {
        await admin.from('order_items').delete().eq('order_id', oid)
        await admin.from('orders').delete().eq('id', oid)
      }
    }

    for (const [sid, lines] of linesBySeller.entries()) {
      const seller = sellerById.get(sid)
      const plan = (seller.plan as SellerPlan) || 'free'
      const isVatRegistered = !!(seller.vat_number && String(seller.vat_number).trim())

      const productCents = lines.reduce((sum, l) => sum + l.total_cents, 0)
      const deliveryExVat = deliveryExVatFor(productCents)

      const split = computeOrderSplit({
        productCents,
        plan,
        isVatRegistered,
        deliveryExVatCents: deliveryExVat,
      })

      // 6a. Create the order (pending) for this seller
      const { data: order, error: orderErr } = await admin
        .from('orders')
        .insert({
          buyer_id: user.id,
          seller_id: sid,
          shipping_name: shipping.name,
          shipping_phone: shipping.phone || null,
          shipping_line1: shipping.line1,
          shipping_line2: shipping.line2 || null,
          shipping_city: shipping.city,
          shipping_province: shipping.province,
          shipping_postal: shipping.postal,
          subtotal_cents: productCents,
          shipping_cents: split.deliveryInclCents,
          delivery_vat_cents: split.deliveryVatCents,
          commission_cents: split.commissionCents,
          seller_amount_cents: split.sellerAmountCents,
          spaza_amount_cents: split.spazaAmountCents,
          total_cents: split.totalCents,
          status: 'pending',
        })
        .select('id, order_number')
        .single()
      if (orderErr || !order) {
        await rollbackAll()
        return NextResponse.json({ error: 'Could not create order.' }, { status: 500 })
      }
      createdOrderIds.push(order.id)

      // 6b. Insert order_items with commission breakdown
      const itemsWithOrder = lines.map(l => {
        // per-line commission proportional to the seller's split
        const lineCommission = Math.round((l.total_cents / productCents) * split.commissionCents)
        return {
          ...l,
          order_id: order.id,
          commission_rate: split.rate,
          commission_cents: lineCommission,
          seller_payout_cents: l.total_cents - lineCommission,
        }
      })
      const { error: itemsErr } = await admin.from('order_items').insert(itemsWithOrder)
      if (itemsErr) {
        await rollbackAll()
        return NextResponse.json({ error: 'Could not save order items.' }, { status: 500 })
      }

      // 6c. Atomically decrement stock for this seller's lines
      const decrementItems = lines.map(l => ({ product_id: l.product_id, qty: l.quantity }))
      const { error: stockErr } = await admin.rpc('purchase_decrement_stock', { items: decrementItems })
      if (stockErr) {
        await rollbackAll()
        const oversold = (stockErr.message || '').includes('insufficient_stock')
        return NextResponse.json(
          { error: oversold ? "Sorry — an item just sold out or doesn't have enough stock. Please review your cart." : 'Could not reserve stock. Please try again.' },
          { status: oversold ? 409 : 500 }
        )
      }

      // 6d. Initialise the Paystack transaction (split via subaccount + flat transaction_charge)
      const reference = `SPZ-${order.order_number}-${Date.now().toString(36)}`
      const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          amount: split.totalCents, // Paystack expects the subunit (cents) for ZAR
          currency: 'ZAR',
          reference,
          subaccount: seller.paystack_subaccount_code,
          transaction_charge: split.spazaAmountCents, // flat amount to Spaza main account
          bearer: 'account', // Spaza (main account) bears Paystack fees
          callback_url: `${APP_URL}/checkout/success?order=${order.id}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            seller_id: sid,
            custom_fields: [
              { display_name: 'Order', variable_name: 'order_number', value: order.order_number },
            ],
          },
        }),
      })
      const initJson = await initRes.json().catch(() => ({} as any))
      if (!initRes.ok || !initJson?.status || !initJson?.data?.authorization_url) {
        await rollbackAll()
        return NextResponse.json(
          { error: initJson?.message || 'Could not start payment.', detail: initJson },
          { status: 502 }
        )
      }

      // store the reference so the webhook can match this order
      await admin.from('orders').update({ paystack_reference: reference }).eq('id', order.id)

      payments.push({
        orderId: order.id,
        orderNumber: order.order_number,
        sellerStore: seller.store_name || 'Seller',
        authorizationUrl: initJson.data.authorization_url,
        totalCents: split.totalCents,
      })
    }

    // 7. Return the payment link(s). Single-seller cart => one link (the common case).
    return NextResponse.json({
      multiSeller: payments.length > 1,
      payments,
      // convenience for the common single-seller path:
      authorizationUrl: payments[0]?.authorizationUrl || null,
      orderId: payments[0]?.orderId || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
