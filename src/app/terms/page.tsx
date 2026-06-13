'use client'

const NAVY = '#0A1628'
const RED = '#D6001C'
const GOLD = '#F5A623'

export default function TermsPage() {
  const updated = 'June 2026'
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      <div style={{ background: NAVY, color: '#fff', padding: '20px 0' }}>
        <div style={{ maxWidth: 820, margin: 'auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color: '#fff', letterSpacing: 1, textDecoration: 'none' }}>SPA<span style={{ color: GOLD }}>ZA</span></a>
          <a href="/" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', opacity: 0.85 }}>← Back to shop</a>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: 'auto', padding: '28px 20px 60px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 32px 40px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <h1 style={{ color: NAVY, fontSize: 30, margin: '0 0 6px', fontFamily: 'var(--font-bebas)', letterSpacing: 0.5 }}>Terms &amp; Conditions</h1>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>The rules for using Spaza &middot; Last updated: {updated}</p>

          <div style={{ background: '#fff7f0', border: `1px solid ${GOLD}66`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#7a5b00', marginBottom: 26 }}>
            <b>Note for Spaza:</b> This is a marketplace-aware starting point, <b>not legal advice.</b> Because Spaza connects independent sellers with buyers, these terms set out who is responsible for what. Please have a South African commercial/e-commerce lawyer review them before publishing &mdash; especially the seller-responsibility, liability and dispute sections &mdash; and fill in the contact details marked below.
          </div>

          <Section title="1. About these terms">
            <P>These Terms &amp; Conditions govern your use of the Spaza marketplace (&ldquo;Spaza&rdquo;, &ldquo;the platform&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by <b>Eden Extract (Pty) Ltd</b> (registration number 2025/756709/07). By using Spaza &mdash; as a buyer or a seller &mdash; you agree to these terms. If you do not agree, please do not use the platform.</P>
          </Section>

          <Section title="2. What Spaza is">
            <P>Spaza is an online <b>marketplace</b> that connects independent sellers with buyers. Sellers list and sell their own products; Spaza provides the platform, processes payments through our payment provider, and arranges delivery through our courier partner. <b>Spaza is not the seller of the products</b> unless expressly stated. The contract of sale for a product is between the buyer and the relevant seller.</P>
          </Section>

          <Section title="3. Your account">
            <Ul items={[
              'You must provide accurate information and keep your account details up to date.',
              'You are responsible for keeping your login details secure. We offer optional two-factor authentication, which we recommend enabling.',
              'You must be 18 or older to create an account.',
              'You are responsible for activity that happens under your account.',
            ]} />
          </Section>

          <Section title="4. Buying on Spaza">
            <Ul items={[
              'Prices are shown in South African Rand and include applicable amounts as displayed at checkout.',
              'When you place an order and pay, you are buying from the seller of that product, through the Spaza platform.',
              'Delivery is arranged through our courier partner; delivery timelines are estimates and may vary.',
              'Your cancellation, return and refund rights are set out in our Refund & Returns Policy and under South African law.',
            ]} />
          </Section>

          <Section title="5. Selling on Spaza">
            <P>If you register as a seller, you also agree that:</P>
            <Ul items={[
              'You are responsible for your products being accurately described, lawful to sell, safe, and of acceptable quality.',
              'You will fulfil orders promptly and hand parcels to the courier as arranged.',
              'You will provide accurate banking details for payouts, and keep your store and pickup information current.',
              'Spaza charges commission on your sales and may charge subscription fees for paid plans, as set out on the platform. Your payout is the sale value less applicable commission and any amounts permitted by these terms.',
              'You are responsible for your own tax obligations (including VAT, where applicable) arising from your sales.',
              'Spaza may review, decline, suspend or remove listings or seller accounts that breach these terms or the law.',
            ]} />
          </Section>

          <Section title="6. Payments &amp; payouts">
            <P>Payments are processed by our payment provider. Spaza does not store your card details. For sales, funds are split so that the seller receives their share and Spaza receives its commission and delivery amounts. Payouts to sellers are made to the bank account on file, subject to these terms and any verification requirements.</P>
          </Section>

          <Section title="7. Prohibited use">
            <P>You may not use Spaza to:</P>
            <Ul items={[
              'Sell illegal, unsafe, counterfeit, or prohibited goods;',
              'Provide false information, impersonate others, or commit fraud;',
              'Infringe anyone’s intellectual property or other rights;',
              'Interfere with, attack, or attempt to gain unauthorised access to the platform;',
              'Use the platform for any unlawful purpose.',
            ]} />
          </Section>

          <Section title="8. Content &amp; intellectual property">
            <P>The Spaza name, branding and platform are owned by Eden Extract (Pty) Ltd. Sellers retain rights in their own product content but grant Spaza permission to display and promote their listings on the platform. You may not copy or reuse platform content without permission.</P>
          </Section>

          <Section title="9. Liability">
            <P>Spaza provides the platform &ldquo;as is&rdquo; and works to keep it running reliably, but we do not guarantee uninterrupted or error-free service. As Spaza is a marketplace and not the seller, sellers are responsible for their products. To the extent permitted by law, Spaza&rsquo;s liability is limited, and nothing in these terms excludes liability that cannot be excluded under South African law, including the Consumer Protection Act. Your statutory rights remain unaffected.</P>
          </Section>

          <Section title="10. Disputes between buyers and sellers">
            <P>Where an issue arises with an order, we encourage buyers and sellers to resolve it in good faith. Spaza may assist in facilitating a resolution (for example a refund where appropriate under our Refund & Returns Policy), but the underlying sale contract is between the buyer and the seller.</P>
          </Section>

          <Section title="11. Privacy">
            <P>We process personal information in line with our <a href="/privacy-policy" style={{ color: RED, fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</a>, which explains your rights under POPIA.</P>
          </Section>

          <Section title="12. Changes to these terms">
            <P>We may update these terms from time to time. The &ldquo;last updated&rdquo; date shows when. Continued use of Spaza after a change means you accept the updated terms.</P>
          </Section>

          <Section title="13. Governing law &amp; contact">
            <P>These terms are governed by the laws of the Republic of South Africa. For any question about these terms, contact us at [INSERT EMAIL].</P>
          </Section>

          <p style={{ fontSize: 12, color: '#aaa', marginTop: 28, borderTop: '1px solid #eee', paddingTop: 16 }}>
            Nothing in these terms limits any rights you have under the Consumer Protection Act 68 of 2008, the Electronic Communications and Transactions Act 25 of 2002, or other applicable South African law.
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
