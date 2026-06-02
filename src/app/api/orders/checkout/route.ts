import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { buildCheckoutPayload, calculateCommission } from '@/lib/payfast'
import { z } from 'zod'

const CheckoutSchema = z.object({
  cartItems: z.array(z.object({
    productId:  z.string().uuid(),
    quantity:   z.number().int().positive(),
  })),
  shippingAddress: z.object({
    name:     z.string().min(2),
    phone:    z.string().optional(),
    line1:    z.string().min(5),
    line2:    z.string().optional(),
    city:     z.string().min(2),
    province: z.string().min(2),
    postal:   z.string().min(4),
  }),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { cartItems, shippingAddress } = parsed.data

    const productIds = cartItems.map((i: any) => i.productId)
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, name, price_cents, stock_qty, seller_id, sellers(id, plan)')
      .in('id', productIds)
      .eq('status', 'active')

    if (prodError || !products?.length) {
      return NextResponse.json({ error: 'Products not found' }, { status: 404 })
    }

    let subtotalCents = 0
    const orderItems: any[] = []

    for (const cartItem of cartItems) {
      const product = products.find((p: any) => p.id === cartItem.productId)
      if (!product) return NextResponse.json({ error: `Product not found` }, { status: 404 })

      const prod = product as any
      if (prod.stock_qty < cartItem.quantity) {
        return NextResponse.json({ error: `Insufficient stock for ${prod.name}` }, { status: 400 })
      }

      const itemTotal = prod.price_cents * cartItem.quantity
      subtotalCents += itemTotal

      const seller = Array.isArray(prod.sellers) ? prod.sellers[0] : prod.sellers
      const { commissionCents, payoutCents, rate } = calculateCommission(itemTotal, seller?.plan || 'basic')

      orderItems.push({
        product_id:          prod.id,
        seller_id:           prod.seller_id,
        product_name:        prod.name,
        quantity:            cartItem.quantity,
        unit_price_cents:    prod.price_cents,
        total_cents:         itemTotal,
        commission_rate:     rate,
        commission_cents:    commissionCents,
        seller_payout_cents: payoutCents,
      })
    }

    const shippingCents = subtotalCents >= 50000 ? 0 : 9900
    const totalCents = subtotalCents + shippingCents

    const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      buyer_id:          user.id,
      shipping_name:     shippingAddress.name,
      shipping_phone:    shippingAddress.phone,
      shipping_line1:    shippingAddress.line1,
      shipping_line2:    shippingAddress.line2,
      shipping_city:     shippingAddress.city,
      shipping_province: shippingAddress.province,
      shipping_postal:   shippingAddress.postal,
      subtotal_cents:    subtotalCents,
      shipping_cents:    shippingCents,
      total_cents:       totalCents,
      status:            'payment_pending',
    }).select().single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    await supabase.from('order_items').insert(
      orderItems.map((item: any) => ({ ...item, order_id: (order as any).id }))
    )

    const { url, fields } = buildCheckoutPayload({
      orderId:     (order as any).id,
      orderNumber: (order as any).order_number,
      amountCents: totalCents,
      buyerEmail:  profile?.email || user.email || '',
      buyerName:   profile?.full_name || 'Customer',
      itemName:    `Spaza Order ${(order as any).order_number}`,
      itemDesc:    `${cartItems.length} item(s) from Spaza Marketplace`,
    })

    return NextResponse.json({ payfast: { url, fields }, order })
  } catch (err) {
    console.error('[Checkout API]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}