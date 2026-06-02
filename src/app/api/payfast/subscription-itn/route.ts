import { NextRequest, NextResponse } from 'next/server'
import { verifyITN } from '@/lib/payfast'
import { createAdminClient } from '@/lib/supabase'

/**
 * PayFast Subscription ITN Handler
 * Handles recurring billing events for seller subscriptions
 * URL: /api/payfast/subscription-itn
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params: Record<string, string> = {}
    body.split('&').forEach(pair => {
      const [key, val] = pair.split('=')
      params[decodeURIComponent(key)] = decodeURIComponent(val?.replace(/\+/g, ' ') || '')
    })

    const isValid = await verifyITN(params)
    if (!isValid) return new NextResponse('INVALID', { status: 400 })

    const supabase  = createAdminClient()
    const sellerId  = params.custom_str1
    const plan      = params.custom_str2
    const pfStatus  = params.payment_status
    const token     = params.token  // PayFast recurring token

    if (pfStatus === 'COMPLETE') {
      // Activate or renew subscription
      const periodStart = new Date()
      const periodEnd   = new Date()
      periodEnd.setMonth(periodEnd.getMonth() + 1)

      await supabase.from('seller_subscriptions').upsert({
        seller_id:              sellerId,
        plan:                   plan,
        status:                 'active',
        payfast_token:          token,
        amount_cents:           Math.round(parseFloat(params.amount_gross) * 100),
        current_period_start:   periodStart.toISOString(),
        current_period_end:     periodEnd.toISOString(),
        next_billing_date:      periodEnd.toISOString(),
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'seller_id' })

      // Ensure seller is marked active
      await supabase.from('sellers')
        .update({ status: 'active', plan: plan, updated_at: new Date().toISOString() })
        .eq('id', sellerId)
    } else if (pfStatus === 'FAILED') {
      // Mark subscription as past_due
      await supabase.from('seller_subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('seller_id', sellerId)

      await supabase.from('sellers')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('id', sellerId)
    }

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('[PayFast Sub ITN] Error:', err)
    return new NextResponse('ERROR', { status: 500 })
  }
}
