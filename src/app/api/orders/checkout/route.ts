import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase-server'
import { buildCheckoutPayload, calculateCommission, type SellerPlan } from '@/lib/payfast'

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

export async function POST(request: Request) {
  try {
    // 1. Auth — identify the buyer from the Authorization bearer token.
    // (More reliable than the session cookie reaching the route handler.)
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    const supabase = await createServerSupabaseClient()
    let user = (await supabase.auth.getUser()).data.user

    // Fallback: if the cookie session wasn't read, use the bearer token.
    if (!user && token) {
      user = (await supabase.auth.getUser(token)).data.user
    }

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to check out.' }, { status: 401 })
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

    // 3. Fetch seller plans for commission
    const sellerIds = [...new Set(products.map(p => p.seller_id))]
    const { data: sellers, error: sellerErr } = await admin
      .from('sellers')
      .select('id, plan')
      .in('id', sellerIds)
    if (sellerErr) {
      return NextResponse.json({ error: 'Could not load seller info.' }, { status: 400 })
    }
    const planById = new Map<string, SellerPlan>()
    sellers?.forEach(s => planById.set(s.id, (s.plan as SellerPlan) || 'basic'))

    // 4. Build order_items with authoritative prices + commission
    let subtotalCents = 0
    const orderItems = items.map(ci => {
      const p = products.find(pr => pr.id === ci.product_id)
      if (!p) throw new Error('Product not found: ' + ci.product_id)
      if (p.status !== 'active') throw new Error('Product not available: ' + p.name)
      const qty = Math.max(1, Math.floor(ci.quantity))
      const lineTotal = p.price_cents * qty
      subtotalCents += lineTotal
      const plan = planById.get(p.seller_id) || 'basic'
      const { commissionCents, payoutCents, rate } = calculateCommission(lineTotal, plan)
      return {
        product_id: p.id,
        seller_id: p.seller_id,
        product_name: p.name,
        product_image: p.images?.[0] ?? null,
        sku: p.sku ?? null,
        quantity: qty,
        unit_price_cents: p.price_cents,
        total_cents: lineTotal,
        commission_rate: rate,
        commission_cents: commissionCents,
        seller_payout_cents: payoutCents,
      }
    })

    // 5. Shipping rule (mirrors the cart: free over R500, else R99)
    const shippingCents = subtotalCents >= 50000 ? 0 : 9900
    const totalCents = subtotalCents + shippingCents

    // 6. Save the address back to the buyer's profile (so it's remembered)
    await admin.from('profiles').update({
      full_name: shipping.name,
      phone: shipping.phone || null,
      address_line1: shipping.line1,
      address_line2: shipping.line2 || null,
      city: shipping.city,
      province: shipping.province,
      postal_code: shipping.postal,
    }).eq('id', user.id)

    // 7. Create the order (pending)
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        buyer_id: user.id,
        shipping_name: shipping.name,
        shipping_phone: shipping.phone || null,
        shipping_line1: shipping.line1,
        shipping_line2: shipping.line2 || null,
        shipping_city: shipping.city,
        shipping_province: shipping.province,
        shipping_postal: shipping.postal,
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        total_cents: totalCents,
        status: 'pending',
      })
      .select('id, order_number')
      .single()
    if (orderErr || !order) {
      return NextResponse.json({ error: 'Could not create order.' }, { status: 500 })
    }

    // 8. Insert order_items linked to the order
    const itemsWithOrder = orderItems.map(it => ({ ...it, order_id: order.id }))
    const { error: itemsErr } = await admin.from('order_items').insert(itemsWithOrder)
    if (itemsErr) {
      return NextResponse.json({ error: 'Could not save order items.' }, { status: 500 })
    }

    // 8b. Atomically decrement stock (guards against overselling). The DB
    // function is all-or-nothing: if any item lacks stock it raises and rolls
    // back every decrement. If it fails, undo the order we just created so we
    // never leave a phantom order that can't be fulfilled.
    const decrementItems = orderItems.map(it => ({ product_id: it.product_id, qty: it.quantity }))
    const { error: stockErr } = await admin.rpc('purchase_decrement_stock', { items: decrementItems })
    if (stockErr) {
      await admin.from('order_items').delete().eq('order_id', order.id)
      await admin.from('orders').delete().eq('id', order.id)
      const oversold = (stockErr.message || '').includes('insufficient_stock')
      return NextResponse.json(
        {
          error: oversold
            ? "Sorry — one of your items just sold out or doesn't have enough stock. Please review your cart."
            : 'Could not reserve stock. Please try again.',
        },
        { status: oversold ? 409 : 500 }
      )
    }

    // 9. Build PayFast payload
    const payload = buildCheckoutPayload({
      orderId: order.id,
      orderNumber: order.order_number,
      amountCents: totalCents,
      buyerEmail: user.email || '',
      buyerName: shipping.name,
      itemName: `Spaza-Order-${order.order_number}`,
      itemDesc: `Spaza-Order-${order.order_number}`,
    })

    // 10. Return the PayFast URL + fields for the client to POST
    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.order_number,
      payfast: payload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
