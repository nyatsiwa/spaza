'use client'

const NAVY = '#0A1628'
const RED = '#D6001C'
const GOLD = '#F5A623'

export default function PrivacyPolicyPage() {
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
          <h1 style={{ color: NAVY, fontSize: 30, margin: '0 0 6px', fontFamily: 'var(--font-bebas)', letterSpacing: 0.5 }}>Privacy Policy</h1>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>How we protect your personal information under POPIA &middot; Last updated: {updated}</p>

          <div style={{ background: '#fff7f0', border: `1px solid ${GOLD}66`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#7a5b00', marginBottom: 26 }}>
            <b>Note for Spaza:</b> This is a POPIA-aware starting point, <b>not legal advice.</b> Before publishing, please (1) have a South African data-protection professional review it, (2) appoint and <b>register your Information Officer with the Information Regulator</b>, and (3) fill in the contact details and company particulars marked below. The cross-border note (Supabase EU hosting) and the operators list should be confirmed against your actual providers.
          </div>

          <Section title="1. Who we are">
            <P>Spaza is an online marketplace operated by <b>Eden Extract (Pty) Ltd</b> (registration number 2025/756709/07) (&ldquo;Spaza&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the &ldquo;responsible party&rdquo; for the personal information described in this policy, in terms of the Protection of Personal Information Act 4 of 2013 (POPIA).</P>
            <P><b>Information Officer:</b> [INSERT NAME] &mdash; contact: [INSERT EMAIL]. Our Information Officer is responsible for our POPIA compliance and is your point of contact for any privacy query or request.</P>
          </Section>

          <Section title="2. What information we collect">
            <P>Depending on how you use Spaza, we may collect:</P>
            <Ul items={[
              'Account details: your name, email address, password (stored securely / hashed) and phone number.',
              'Delivery details: your shipping address, suburb, city, province and postal code.',
              'Order information: the products you buy, order history and communications about your orders.',
              'Seller details (if you sell on Spaza): your store name, business details, pickup address, and bank account details used to pay you.',
              'Technical information: limited data needed to operate the site securely (for example session and login information).',
            ]} />
            <P>We do <b>not</b> store your card details. Card payments are processed securely by our payment provider on their own systems.</P>
          </Section>

          <Section title="3. Why we process it (lawful basis &amp; purpose)">
            <P>We process your personal information only where the law allows, in particular to:</P>
            <Ul items={[
              'Perform our contract with you — creating your account, processing orders, arranging delivery, and paying sellers.',
              'Comply with legal obligations — such as tax, accounting and consumer-protection requirements.',
              'Pursue legitimate interests — keeping the platform secure, preventing fraud, and improving our service.',
              'Where required, on the basis of your consent — for example optional marketing, which you can withdraw at any time.',
            ]} />
          </Section>

          <Section title="4. Who we share it with (operators &amp; third parties)">
            <P>We share personal information only as needed to run Spaza, with service providers (&ldquo;operators&rdquo;) who process it on our instructions and under confidentiality and security obligations. These include:</P>
            <Ul items={[
              'Our hosting and database provider (for storing account, order and store data).',
              'Our payment provider (to process payments and pay sellers).',
              'Our courier partner (to collect and deliver parcels — they receive the delivery name, address and contact details needed for delivery).',
              'Sellers — when you place an order, the relevant seller receives the information needed to fulfil and deliver it.',
            ]} />
            <P>We do not sell your personal information. We may disclose information where required by law or to protect our legal rights.</P>
          </Section>

          <Section title="5. Where your information is stored (cross-border)">
            <P>Some of our service providers store data outside South Africa &mdash; for example our database is hosted in the European Union. POPIA permits this where the receiving country or provider offers an adequate level of protection comparable to POPIA. By using Spaza, you understand that your information may be processed outside South Africa under these safeguards. [Confirm provider locations and safeguards with your providers.]</P>
          </Section>

          <Section title="6. How long we keep it">
            <P>We keep personal information only for as long as needed for the purposes above, or as required by law (for example, retaining order and tax records for the period required by South African law). When information is no longer needed, we securely delete or de-identify it.</P>
          </Section>

          <Section title="7. How we protect it">
            <P>We take reasonable technical and organisational measures to protect your information, including access controls, encryption in transit, secure authentication (with optional two-factor authentication available on your account), and limiting access to those who need it. No system is perfectly secure, but we work to keep your information safe.</P>
          </Section>

          <Section title="8. Your rights">
            <P>Under POPIA you have the right to:</P>
            <Ul items={[
              'Access the personal information we hold about you.',
              'Ask us to correct or update information that is inaccurate or incomplete.',
              'Ask us to delete information we no longer have a lawful reason to keep.',
              'Object to processing in certain circumstances, including direct marketing.',
              'Withdraw consent where we relied on it.',
              'Lodge a complaint with the Information Regulator.',
            ]} />
            <P>To exercise any of these, contact our Information Officer (section 1). You may make a request by email or other expedient means; we will respond as required by law.</P>
          </Section>

          <Section title="9. Direct marketing">
            <P>We will only send you marketing messages where the law allows or where you have consented. Every marketing message will give you a simple way to opt out, and you can object to marketing at any time by contacting us.</P>
          </Section>

          <Section title="10. Data breaches">
            <P>If a security compromise affects your personal information, we will notify the Information Regulator and affected people as soon as reasonably possible, as required by POPIA.</P>
          </Section>

          <Section title="11. Children">
            <P>Spaza is intended for users aged 18 and over. We do not knowingly collect the personal information of children without the consent of a competent person.</P>
          </Section>

          <Section title="12. Changes &amp; contact">
            <P>We may update this policy from time to time; the &ldquo;last updated&rdquo; date above shows when. For any privacy question or to exercise your rights, contact our Information Officer at [INSERT EMAIL]. You may also contact the Information Regulator (South Africa) if you believe your rights have been infringed.</P>
          </Section>

          <p style={{ fontSize: 12, color: '#aaa', marginTop: 28, borderTop: '1px solid #eee', paddingTop: 16 }}>
            This policy is provided for transparency and does not limit any rights you have under the Protection of Personal Information Act 4 of 2013 or other applicable law.
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
