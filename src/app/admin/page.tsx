'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'

const NAVY = '#0A1628'
const RED = '#D6001C'
const GOLD = '#F5A623'
const GREEN = '#00A651'

const money = (cents: number) =>
  'R ' + ((cents || 0) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface ProductRow {
  id: string; name: string; price_cents: number; stock_qty: number | null; status: string;
  images: string[] | null; rejection_reason: string | null; seller_id: string; created_at: string;
  sellers?: { store_name: string } | null
}
interface SellerRow {
  id: string; store_name: string; plan: string; status: string;
  total_sales: number | null; total_orders: number | null; created_at: string;
  bank_account_number?: string | null; paystack_bank_code?: string | null; paystack_subaccount_code?: string | null
}
interface OrderRow {
  id: string; order_number: string; status: string; subtotal_cents: number;
  shipping_cents: number; total_cents: number; shipping_name: string; created_at: string
}
interface AcctRow {
  seller_id: string; store_name: string; gross_cents: number; commission_cents: number; payout_cents: number; line_items: number
}
interface PayoutPeriod {
  period_start: string; period_end: string; label: string; amount_cents: number; paid: boolean; paid_at: string | null; due: boolean
}
interface PayoutSeller {
  seller_id: string; store_name: string; periods: PayoutPeriod[];
  banking: { bank_name?: string | null; bank_account_number?: string | null; bank_branch_code?: string | null; bank_account_type?: string | null; complete: boolean }
}
interface Data {
  products: ProductRow[]; pending: ProductRow[]; sellers: SellerRow[]; orders: OrderRow[];
  pendingReviews: { id: string; product_id: string; rating: number; title: string | null; body: string | null; created_at: string; products?: { name: string } | null }[];
  accounting: {
    totals: { gross_cents: number; commission_cents: number; payout_cents: number };
    bySeller: AcctRow[];
    payouts: PayoutSeller[];
  }
}

type Tab = 'pending' | 'products' | 'sellers' | 'orders' | 'reviews' | 'accounting'

const statusColor: Record<string, string> = {
  active: GREEN, pending: GOLD, rejected: RED, removed: '#999', draft: '#999',
  out_of_stock: '#b26a00', suspended: RED, terminated: '#999',
}

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    const t = data.session?.access_token
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login?redirect=/admin'); return }
    try {
      const res = await fetch('/api/admin', { headers: { ...(await authHeaders()) } })
      if (res.status === 403) { toast.error('Admins only'); router.push('/'); return }
      if (!res.ok) { toast.error('Could not load admin data'); setLoading(false); return }
      setData(await res.json())
    } catch { toast.error('Could not load admin data') }
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function act(payload: Record<string, unknown>, key: string) {
    setBusy(key)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'Action failed'); setBusy(null); return }
      toast.success('Done ✓')
      await load()
    } catch { toast.error('Action failed') }
    setBusy(null)
  }

  function approve(id: string) { act({ action: 'approve_product', productId: id }, 'p' + id) }
  function reject(id: string) {
    const reason = window.prompt('Reason for rejection (the seller will see this):', 'Did not meet listing guidelines.')
    if (reason === null) return
    act({ action: 'reject_product', productId: id, reason }, 'p' + id)
  }
  function setProductStatus(id: string, status: string) { act({ action: 'set_product_status', productId: id, status }, 'p' + id) }
  function suspendSeller(id: string) { if (confirm('Suspend this seller? Their products stay but they are flagged suspended.')) act({ action: 'suspend_seller', sellerId: id }, 's' + id) }
  function activateSeller(id: string) { act({ action: 'activate_seller', sellerId: id }, 's' + id) }
  function createSubaccount(id: string) { act({ action: 'create_subaccount', sellerId: id }, 'sa' + id) }
  function approveReview(id: string) { act({ action: 'approve_review', reviewId: id }, 'r' + id) }
  function rejectReview(id: string) { if (confirm('Delete this review? This cannot be undone.')) act({ action: 'reject_review', reviewId: id }, 'r' + id) }
  function payPayout(p: PayoutSeller, period: PayoutPeriod) {
    if (!confirm(`Mark ${money(period.amount_cents)} to ${p.store_name} for ${period.label} as PAID?\n\nThis records the payout — make the actual EFT separately.`)) return
    act({ action: 'pay_payout', sellerId: p.seller_id, periodStart: period.period_start, periodEnd: period.period_end, amountCents: period.amount_cents }, 'pay' + p.seller_id + period.period_start)
  }
  function unpayPayout(p: PayoutSeller, period: PayoutPeriod) {
    if (!confirm(`Undo the paid mark for ${p.store_name} · ${period.label}?`)) return
    act({ action: 'unpay_payout', sellerId: p.seller_id, periodStart: period.period_start }, 'pay' + p.seller_id + period.period_start)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading admin…</div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>No data.</div>

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: 'Pending approvals', count: data.pending.length },
    { key: 'products', label: 'All products', count: data.products.length },
    { key: 'sellers', label: 'Sellers', count: data.sellers.length },
    { key: 'orders', label: 'Orders', count: data.orders.length },
    { key: 'reviews', label: 'Reviews', count: data.pendingReviews.length },
    { key: 'accounting', label: 'Accounting' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      <div style={{ background: NAVY, color: '#fff', padding: '18px 0' }}>
        <div style={{ maxWidth: 1100, margin: 'auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 26, color: '#fff', letterSpacing: 1, textDecoration: 'none' }}>SPA<span style={{ color: GOLD }}>ZA</span></a>
            <span style={{ marginLeft: 12, fontSize: 13, opacity: 0.7 }}>Admin</span>
          </div>
          <a href="/account" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', opacity: 0.85 }}>← My account</a>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: 'auto', padding: '20px' }}>
        {/* tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ background: tab === t.key ? NAVY : '#fff', color: tab === t.key ? '#fff' : NAVY, border: '1px solid #dde0e8', padding: '9px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {/* PENDING */}
        {tab === 'pending' && (
          data.pending.length === 0
            ? <Empty text="No products waiting for review. 🎉" />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.pending.map(p => (
                  <Card key={p.id}>
                    <Thumb p={p} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: NAVY }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{p.sellers?.store_name || '—'} · {money(p.price_cents)} · stock {p.stock_qty ?? 0}</div>
                    </div>
                    <button disabled={busy === 'p' + p.id} onClick={() => approve(p.id)}
                      style={{ background: GREEN, color: '#fff', border: 'none', padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Approve</button>
                    <button disabled={busy === 'p' + p.id} onClick={() => reject(p.id)}
                      style={{ background: '#fff', color: RED, border: `1px solid ${RED}`, padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reject</button>
                  </Card>
                ))}
              </div>
        )}

        {/* ALL PRODUCTS */}
        {tab === 'products' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.products.map(p => (
              <Card key={p.id}>
                <Thumb p={p} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: NAVY }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {p.sellers?.store_name || '—'} · {money(p.price_cents)} · stock {p.stock_qty ?? 0} ·{' '}
                    <Badge status={p.status} />
                  </div>
                  {p.status === 'rejected' && p.rejection_reason && <div style={{ fontSize: 12, color: RED, marginTop: 2 }}>Reason: {p.rejection_reason}</div>}
                </div>
                {p.status === 'active'
                  ? <button disabled={busy === 'p' + p.id} onClick={() => setProductStatus(p.id, 'removed')} style={btnGhost(RED)}>Remove</button>
                  : p.status === 'pending'
                    ? <button disabled={busy === 'p' + p.id} onClick={() => approve(p.id)} style={btnSolid(GREEN)}>Approve</button>
                    : <button disabled={busy === 'p' + p.id} onClick={() => setProductStatus(p.id, 'active')} style={btnSolid(NAVY)}>Make active</button>}
              </Card>
            ))}
          </div>
        )}

        {/* SELLERS */}
        {tab === 'sellers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.sellers.map(s => {
              const hasBank = !!(s.paystack_bank_code && s.bank_account_number)
              const hasSub = !!s.paystack_subaccount_code
              return (
              <Card key={s.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: NAVY }}>{s.store_name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {s.plan === 'growth' ? 'Growth' : 'Free'} · <Badge status={s.status} /> · {s.total_orders ?? 0} orders
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {hasSub
                      ? <span style={{ color: GREEN, fontWeight: 700 }}>✓ Paystack subaccount active</span>
                      : hasBank
                        ? <span style={{ color: '#b26a00' }}>Banking set — subaccount not created</span>
                        : <span style={{ color: '#999' }}>No banking on file</span>}
                  </div>
                </div>
                {!hasSub && hasBank && (
                  <button disabled={busy === 'sa' + s.id} onClick={() => createSubaccount(s.id)} style={btnSolid('#0A1628')}>
                    {busy === 'sa' + s.id ? 'Creating…' : 'Create subaccount'}
                  </button>
                )}
                {s.status === 'suspended'
                  ? <button disabled={busy === 's' + s.id} onClick={() => activateSeller(s.id)} style={btnSolid(GREEN)}>Reactivate</button>
                  : <button disabled={busy === 's' + s.id} onClick={() => suspendSeller(s.id)} style={btnGhost(RED)}>Suspend</button>}
              </Card>
            )})}
          </div>
        )}

        {/* ORDERS */}
        {tab === 'orders' && (
          data.orders.length === 0
            ? <Empty text="No orders yet." />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.orders.map(o => (
                  <Card key={o.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{o.order_number}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{o.shipping_name} · {new Date(o.created_at).toLocaleDateString('en-ZA')} · <Badge status={o.status} /></div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-bebas)', color: NAVY, fontSize: 20 }}>{money(o.total_cents)}</div>
                    {o.status === 'paid'
                      ? <button disabled={busy === 'o' + o.id} onClick={() => act({ action: 'unmark_order_paid', orderId: o.id }, 'o' + o.id)} style={btnGhost('#888')}>Unmark paid</button>
                      : <button disabled={busy === 'o' + o.id} onClick={() => act({ action: 'mark_order_paid', orderId: o.id }, 'o' + o.id)} style={btnSolid(GREEN)}>Mark paid (test)</button>}
                  </Card>
                ))}
              </div>
        )}

        {/* REVIEWS */}
        {tab === 'reviews' && (
          data.pendingReviews.length === 0
            ? <Empty text="No reviews waiting for approval. 🎉" />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.pendingReviews.map(r => (
                  <Card key={r.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#888' }}>{r.products?.name || 'Product'}</div>
                      <div style={{ color: GOLD, fontSize: 16 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                      {r.title && <div style={{ fontWeight: 700, color: NAVY, marginTop: 4 }}>{r.title}</div>}
                      {r.body && <div style={{ fontSize: 14, color: '#444', marginTop: 2 }}>{r.body}</div>}
                    </div>
                    <button disabled={busy === 'r' + r.id} onClick={() => approveReview(r.id)} style={btnSolid(GREEN)}>Approve</button>
                    <button disabled={busy === 'r' + r.id} onClick={() => rejectReview(r.id)} style={btnGhost(RED)}>Delete</button>
                  </Card>
                ))}
              </div>
        )}

        {/* ACCOUNTING */}
        {tab === 'accounting' && (
          <div>
            <div style={{ background: '#fff7f0', border: `1px solid ${GOLD}55`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7a5b00', marginBottom: 16 }}>
              These are <b>expected / pending</b> figures based on orders placed. They are not settled payments — PayFast settlement and refunds aren't wired in yet, so treat these as projections.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Stat label="Gross sales (expected)" value={money(data.accounting.totals.gross_cents)} />
              <Stat label="Commission earned" value={money(data.accounting.totals.commission_cents)} color={GREEN} />
              <Stat label="Owed to sellers (payouts)" value={money(data.accounting.totals.payout_cents)} color={NAVY} />
            </div>
            <h3 style={{ color: NAVY, fontSize: 15, margin: '0 0 10px' }}>Payout schedule (per seller · 1st–14th and 15th–end)</h3>
            {data.accounting.payouts.length === 0
              ? <Empty text="No sales recorded yet." />
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {data.accounting.payouts.map(ps => (
                    <div key={ps.seller_id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                      <div style={{ padding: '12px 14px', background: '#f0f1f4' }}>
                        <div style={{ fontWeight: 700, color: NAVY }}>{ps.store_name}</div>
                        {ps.banking.complete ? (
                          <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
                            {ps.banking.bank_name} · <span style={{ textTransform: 'capitalize' }}>{ps.banking.bank_account_type}</span> · Acc {ps.banking.bank_account_number} · Branch {ps.banking.bank_branch_code}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: RED, fontWeight: 700, marginTop: 3 }}>⚠ No payout details on file — seller must add banking before they can be paid</div>
                        )}
                      </div>
                      {ps.periods.map(per => (
                        <div key={per.period_start} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: '1px solid #f0f1f4', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{per.label}</div>
                            <div style={{ fontSize: 12, marginTop: 2 }}>
                              {per.paid
                                ? <span style={{ color: GREEN, fontWeight: 700 }}>Paid{per.paid_at ? ' · ' + new Date(per.paid_at).toLocaleDateString('en-ZA') : ''}</span>
                                : per.due
                                  ? <span style={{ color: RED, fontWeight: 700 }}>Due now</span>
                                  : <span style={{ color: '#888' }}>Current period (still accruing)</span>}
                            </div>
                          </div>
                          <div style={{ fontFamily: 'var(--font-bebas)', color: NAVY, fontSize: 22, minWidth: 110, textAlign: 'right' }}>{money(per.amount_cents)}</div>
                          {per.paid
                            ? <button disabled={busy === 'pay' + ps.seller_id + per.period_start} onClick={() => unpayPayout(ps, per)} style={btnGhost('#888')}>Undo</button>
                            : <button disabled={busy === 'pay' + ps.seller_id + per.period_start || !per.due || !ps.banking.complete}
                                title={!ps.banking.complete ? 'Seller has no banking details' : (!per.due ? 'Period not closed yet' : '')}
                                onClick={() => payPayout(ps, per)}
                                style={{ background: (per.due && ps.banking.complete) ? GREEN : '#cfd3da', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: (per.due && ps.banking.complete) ? 'pointer' : 'not-allowed' }}>
                                Pay
                              </button>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>{children}</div>
}
function Thumb({ p }: { p: ProductRow }) {
  return (
    <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f0f1f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {p.images && p.images.length ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🛒</span>}
    </div>
  )
}
function Badge({ status }: { status: string }) {
  const label = status === 'draft' ? 'hidden' : status.replace(/_/g, ' ')
  return <span style={{ textTransform: 'capitalize', color: statusColor[status] || '#666', fontWeight: 700 }}>{label}</span>
}
function Empty({ text }: { text: string }) {
  return <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#999' }}>{text}</div>
}
function Stat({ label, value, color = NAVY }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-bebas)', marginTop: 4 }}>{value}</div>
    </div>
  )
}
function btnSolid(bg: string): React.CSSProperties {
  return { background: bg, color: '#fff', border: 'none', padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }
}
function btnGhost(color: string): React.CSSProperties {
  return { background: '#fff', color, border: `1px solid ${color}`, padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }
}
