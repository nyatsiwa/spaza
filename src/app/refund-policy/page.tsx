'use client'

const NAVY = '#0A1628'
const RED = '#D6001C'
const GOLD = '#F5A623'

export default function RefundPolicyPage() {
  const updated = 'June 2026'
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      {/* header */}
      <div style={{ background: NAVY, color: '#fff', padding: '20px 0' }}>
        <div style={{ maxWidth: 820, margin: 'auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color: '#fff', letterSpacing: 1, textDecoration: 'none' }}>SPA<span style={{ color: GOLD }}>ZA</span></a>
          <a href="/" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', opacity: 0.85 }}>← Back to shop</a>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: 'auto', padding: '28px 20px 60px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 32px 40px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <h1 style={{ color: NAVY, fontSize: 30, margin: '0 0 6px', fontFamily: 'var(--font-bebas)', letterSpacing: 0.5 }}>Refund &amp; Returns Policy</h1>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>Last updated: {updated}</p>

          {/* lawyer-review notice */}
          <div style={{ background: '#fff7f0', border: `1px solid ${GOLD}66`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#7a5b00', marginBottom: 26 }}>
            <b>Note for Spaza:</b> This policy is a carefully prepared starting point aligned with South Africa&rsquo;s Electronic Communications and Transactions Act (ECTA) and Consumer Protection Act (CPA). It is <b>not legal advice.</b> Please have a South African consumer-law professional review and approve it before relying on it &mdash; particularly the exclusions for consumable/perishable goods and the split of responsibilities between Spaza and sellers.
          </div>

          <Section title="1. Overview">
            <P>Spaza is an online marketplace where independent sellers list and sell their products. When you buy on Spaza, your order is fulfilled by the seller and delivered by our courier partner. This policy explains when you can cancel an order, return goods, and receive a refund. Your rights under South African law &mdash; including the ECT Act and the Consumer Protection Act &mdash; always apply and are not limited by this policy.</P>
          </Section>

          <Section title="2. Cancelling before dispatch (full refund)">
            <P>You may cancel any order at no cost and receive a <b>full refund</b> at any time <b>before a waybill has been created</b> for it (that is, before the seller has handed your parcel to the courier). Once you request a cancellation in this window, we will reverse the payment to you.</P>
            <P>To cancel before dispatch, contact us or use the cancellation option on your order as soon as possible.</P>
          </Section>

          <Section title="3. After dispatch (in transit)">
            <P>Once a waybill has been created and your parcel is in transit, the order can no longer be simply <b>cancelled</b> mid-delivery. However, this does not remove your return and refund rights below &mdash; in particular your 7-day cooling-off right and your rights regarding faulty goods.</P>
          </Section>

          <Section title="4. 7-day cooling-off right (online purchases)">
            <P>Because you are buying online, the ECT Act gives you a <b>cooling-off period of 7 days after delivery</b> during which you may return eligible goods <b>for any reason</b> and receive a full refund of the price of the goods. Conditions:</P>
            <Ul items={[
              'The goods must be returned in their original, unused and resaleable condition, with packaging intact.',
              'You are responsible for the cost of returning the goods to the seller, unless the goods were faulty, damaged or not as described.',
              'Once the returned goods are received and checked, your refund for the price of the goods will be processed.',
            ]} />
            <P><b>Important exclusions.</b> By law, the cooling-off right does <b>not</b> apply to certain goods. These include perishable or consumable items (for example food, supplements and powdered products), goods made or customised to your specification, items that have been unsealed where this affects hygiene or safety, and other categories excluded under the ECT Act. Where an item is excluded, the cooling-off right does not apply, but your rights regarding faulty or defective goods (section 5) still do.</P>
          </Section>

          <Section title="5. Faulty, damaged or incorrect goods">
            <P>Separately from the cooling-off right, the Consumer Protection Act entitles you to a refund, replacement or repair if goods are:</P>
            <Ul items={[
              'Defective or of poor quality;',
              'Damaged in transit or on arrival;',
              'Not as described, or materially different from what was shown when you bought them.',
            ]} />
            <P>Report these to us within a reasonable time of delivery. These rights apply even where the 7-day cooling-off right does not (for example on consumable goods), and may extend beyond 7 days as provided by law.</P>
          </Section>

          <Section title="6. Delivery fees">
            <P>Where an order is cancelled before dispatch, any delivery fee you paid is refunded in full. For returns under the 7-day cooling-off right, the price of the goods is refunded; delivery fees already incurred may not be refundable except where the goods were faulty, damaged or incorrect, in which case Spaza covers the return cost.</P>
          </Section>

          <Section title="7. How refunds are paid">
            <P>Refunds are made to the original payment method used at checkout, processed through our payment provider. Once a refund is approved, we aim to process it promptly; please allow a reasonable period (and up to 15 business days where applicable) for the funds to reflect, depending on your bank.</P>
          </Section>

          <Section title="8. How to request a refund or return">
            <P>To cancel, return an item, or report a problem, contact Spaza with your order number and a short description (and photos, where the goods are faulty or damaged). We will confirm whether your request falls under cancellation, the cooling-off right, or faulty-goods rights, and guide you through the next steps.</P>
          </Section>

          <Section title="9. Contact">
            <P>Spaza &mdash; operated by Eden Extract (Pty) Ltd. For any refund or return query, please contact us through the details provided on our website.</P>
          </Section>

          <p style={{ fontSize: 12, color: '#aaa', marginTop: 28, borderTop: '1px solid #eee', paddingTop: 16 }}>
            This policy summarises your rights and our process. Nothing in it limits the rights you have under the Consumer Protection Act 68 of 2008 or the Electronic Communications and Transactions Act 25 of 2002. Where this policy and the law differ, the law applies.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ color: NAVY, fontSize: 17, margin: '0 0 8px' }}>{title}</h2>
      {children}
    </div>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: '#444', fontSize: 14.5, lineHeight: 1.65, margin: '0 0 10px' }}>{children}</p>
}
function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ color: '#444', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 10px', paddingLeft: 22 }}>
      {items.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
    </ul>
  )
}
