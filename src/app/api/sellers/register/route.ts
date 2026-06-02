import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { buildSubscriptionPayload } from '@/lib/payfast'
import { z } from 'zod'

const SellerRegSchema = z.object({
  storeName:    z.string().min(2).max(80),
  storeSlug:    z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description:  z.string().max(500).optional(),
  businessName: z.string().optional(),
  regNumber:    z.string().optional(),
  vatNumber:    z.string().optional(),
  category:     z.string(),
  plan:         z.enum(['basic', 'pro', 'elite']),
  phone:        z.string().min(10),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const parsed = SellerRegSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data

    // Check slug not taken
    const { data: existing } = await supabase
      .from('sellers')
      .select('id')
      .eq('store_slug', data.storeSlug)
      .single()

    if (existing) return NextResponse.json({ error: 'Store URL already taken' }, { status: 409 })

    // Fetch profile for seller name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    // Create seller record (status = pending until subscription payment confirmed)
    const { data: seller, error } = await supabase.from('sellers').insert({
      user_id:        user.id,
      store_name:     data.storeName,
      store_slug:     data.storeSlug,
      store_description: data.description,
      business_name:  data.businessName,
      reg_number:     data.regNumber,
      vat_number:     data.vatNumber,
      category:       data.category,
      plan:           data.plan,
      status:         'pending',
    }).select().single()

    if (error || !seller) {
      return NextResponse.json({ error: 'Failed to create seller account' }, { status: 500 })
    }

    // Update profile role and phone
    await supabase.from('profiles').update({
      role:  'seller',
      phone: data.phone,
    }).eq('id', user.id)

    // Build PayFast subscription payload
    const { url, fields } = buildSubscriptionPayload({
      sellerId:    seller.id,
      sellerEmail: profile?.email || user.email || '',
      sellerName:  profile?.full_name || data.storeName,
      plan:        data.plan,
    })

    return NextResponse.json({ seller, payfast: { url, fields } })
  } catch (err) {
    console.error('[Seller Register]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
