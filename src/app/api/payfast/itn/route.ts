import { NextRequest, NextResponse } from 'next/server'
import { verifyITN } from '@/lib/payfast'
import { createAdminClient } from '@/lib/supabase'

/**
 * PayFast Instant Transaction Notification (ITN) Handler
 * PayFast POSTs to this endpoint after every payment event.
 * URL: /api/payfast/itn
 */
export async function POST(req: NextRequest) {
  try {
    // Parse the ITN payload
    const body = await req.text()
    const params: Record<string, string> = {}
    body.split('&').forEach(pair => {
      const [key, val] = pair.split('=')
      params[decodeURIComponent(key)] = decodeURIComponent(val?.replace(/\+/g, ' ') || '')
    })

    // Verify authenticity with PayFast
    const isValid = await verifyITN(params)
    if (!isValid) {
      console.error('[PayFast ITN] Invalid signature or failed validation')
      return new NextResponse('INVALID', { status: 400 })
    }

    const supabase = createAdminClient()
    const orderId  = params.custom_str1
    const pfStatus = params.payment_status  // COMPLETE, FAILED, CANCELLED

    // Upsert payment record
    await supabase.from('payments').upsert({
      order_id:             orderId,
      payfast_payment_id:   params.m_payment_id,
      payfast_pf_payment_id: params.pf_payment_id,
      merchant_id:          params.merchant_id,
      amount_cents:         Math.round(parseFloat(params.amount_gross) * 100),
      status:               pfStatus === 'COMPLETE' ? 'complete'
                           : pfStatus === 'FAILED'  ? 'failed' : 'cancelled',
      payment_method:       params.payment_method,
      item_name:            params.item_name,
      itn_payload:          params,
      paid_at:              pfStatus === 'COMPLETE' ? new Date().toISOString() : null,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'payfast_payment_id' })

    // Update order status
    if (pfStatus === 'COMPLETE') {
      await supabase.from('orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', orderId)

      // Decrement stock for each item
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId)

      if (items) {
        for (const item of items) {
          await supabase.rpc('decrement_stock', {
            p_product_id: item.product_id,
            p_qty: item.quantity,
          })
        }
      }
    } else {
      await supabase.from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderId)
    }

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('[PayFast ITN] Error:', err)
    return new NextResponse('ERROR', { status: 500 })
  }
}
