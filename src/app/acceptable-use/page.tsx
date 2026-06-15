import Link from 'next/link'

export const metadata = {
  title: 'Acceptable Use Policy – Spaza',
  description: 'The rules for buying and selling on the Spaza marketplace, including prohibited and restricted goods.',
}

const C = {
  red: '#E3001B', navy: '#0A1628', gold: '#F5A623',
  offWhite: '#F7F8FA', white: '#FFFFFF', g600: '#5C6472', g800: '#2D3340',
}

export default function AcceptableUsePage() {
  const updated = 'June 2026'
  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', background: C.offWhite, color: C.g800, minHeight: '100vh' }}>
      <div style={{ background: C.red, padding: '0 20px', height: 60, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 820, margin: 'auto', width: '100%' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-bebas)', fontSize: 30, color: C.white, letterSpacing: 2, textDecoration: 'none' }}>SPA<span style={{ color: C.gold }}>ZA</span></Link>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: 'auto', padding: '32px 20px 64px', lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 28, color: C.navy, marginTop: 0 }}>Acceptable Use Policy</h1>
        <p style={{ color: C.g600, fontSize: 14 }}>Last updated: {updated}</p>

        <p>
          This Acceptable Use Policy (&ldquo;Policy&rdquo;) governs the use of the Spaza marketplace
          (&ldquo;Spaza&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by Eden Extract (Pty) Ltd
          (registration 2025/756709/07). It applies to everyone who uses Spaza, including buyers and
          sellers. By using Spaza you agree to this Policy. It should be read together with our{' '}
          <Link href="/terms" style={{ color: C.red }}>Terms of Service</Link>,{' '}
          <Link href="/privacy-policy" style={{ color: C.red }}>Privacy Policy</Link> and{' '}
          <Link href="/refund-policy" style={{ color: C.red }}>Refund Policy</Link>.
        </p>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>1. Who this applies to</h2>
        <p>
          Spaza is an online marketplace for physical consumer goods. Sellers list products and buyers
          purchase them. Payments are processed by Paystack, and each seller&rsquo;s share is settled
          directly to that seller via a verified Paystack subaccount. Sellers are responsible for the
          legality, safety, accuracy, and delivery of the goods they list.
        </p>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>2. Prohibited goods and activities</h2>
        <p>You may not list, sell, buy, or facilitate any of the following on Spaza:</p>
        <ul style={{ paddingLeft: 22 }}>
          <li>Anything illegal under South African law, or goods whose sale, possession, or import is unlawful.</li>
          <li>Weapons, firearms, ammunition, explosives, or parts intended to convert or manufacture them.</li>
          <li>Illegal drugs, narcotics, or substances marketed as their substitutes; drug paraphernalia.</li>
          <li>Prescription medicines, scheduled pharmaceuticals, or any product requiring a licence to dispense.</li>
          <li>Counterfeit, replica, or pirated goods, or items that infringe another party&rsquo;s trademark, copyright, or other intellectual property.</li>
          <li>Stolen goods, or goods you are not lawfully entitled to sell.</li>
          <li>Sexual or adult services, child sexual abuse material, or any content that exploits or endangers minors.</li>
          <li>Human or animal parts, endangered or protected species, or products derived from them.</li>
          <li>Hazardous, toxic, or recalled materials prohibited from public sale.</li>
          <li>Financial instruments, currency, securities, or anything designed to facilitate money laundering, fraud, or the evasion of tax or sanctions.</li>
          <li>Goods or content that promote hate, violence, terrorism, or discrimination.</li>
        </ul>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>3. Restricted goods</h2>
        <p>
          Some goods may only be listed if the seller holds the necessary licences, permits, or
          age-verification and complies with all applicable laws — for example alcohol, tobacco and
          vaping products, certain supplements, and age-restricted items. We may require proof of
          compliance and may remove such listings at our discretion.
        </p>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>4. Seller obligations</h2>
        <ul style={{ paddingLeft: 22 }}>
          <li>List products accurately, including honest descriptions, images, pricing, and stock levels.</li>
          <li>Sell only goods you are legally entitled to sell, and fulfil orders promptly.</li>
          <li>Provide valid banking details; payouts are made via your verified Paystack subaccount.</li>
          <li>Honour your obligations to buyers under the Consumer Protection Act, including for defective or misdescribed goods.</li>
          <li>Not attempt to take payment outside the Spaza checkout, or to circumvent our fees or controls.</li>
        </ul>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>5. Buyer obligations</h2>
        <ul style={{ paddingLeft: 22 }}>
          <li>Provide accurate contact and delivery information.</li>
          <li>Use the platform lawfully and not to defraud sellers or Spaza (including fraudulent chargebacks or refund abuse).</li>
        </ul>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>6. Platform and security</h2>
        <ul style={{ paddingLeft: 22 }}>
          <li>Do not attempt to gain unauthorised access to the platform, other accounts, or our systems.</li>
          <li>Do not introduce malware, scrape data without permission, or interfere with the service&rsquo;s operation.</li>
          <li>Do not use Spaza to send spam or to harvest other users&rsquo; personal information.</li>
        </ul>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>7. Enforcement</h2>
        <p>
          We review product listings before they go live and may reject any listing that breaches this
          Policy. We may remove content, cancel transactions, withhold or reverse payouts where permitted,
          and suspend or terminate any account that breaches this Policy or applicable law. Serious or
          unlawful conduct may be reported to the relevant authorities.
        </p>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>8. Disputes and refunds</h2>
        <p>
          Buyers may raise a refund request through their order, selecting a reason. Requests are reviewed
          by Spaza and, where approved, processed through Paystack. See our{' '}
          <Link href="/refund-policy" style={{ color: C.red }}>Refund Policy</Link> for details.
        </p>

        <h2 style={{ color: C.navy, fontSize: 20, marginTop: 28 }}>9. Changes and contact</h2>
        <p>
          We may update this Policy from time to time; the current version is always available on this page.
          Questions about this Policy can be sent to{' '}
          <a href="mailto:support@spaza-sa.co.za" style={{ color: C.red }}>support@spaza-sa.co.za</a>.
        </p>

        <p style={{ marginTop: 32 }}>
          <Link href="/" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>← Back to Spaza</Link>
        </p>
      </div>
    </div>
  )
}
