import type { Metadata } from 'next'
import Link from 'next/link'
import { Bebas_Neue, DM_Sans, DM_Mono } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const bebasNeue = Bebas_Neue({
  weight:   '400',
  subsets:  ['latin'],
  variable: '--font-bebas',
  display:  'swap',
})
const dmSans = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-dm-sans',
  display:  'swap',
})
const dmMono = DM_Mono({
  weight:   ['400', '500'],
  subsets:  ['latin'],
  variable: '--font-dm-mono',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       "Spaza – South Africa's Online Marketplace",
  description: 'Buy and sell millions of products across South Africa. Electronics, fashion, home, sport and more. Operated by Eden Extract (Pty) Ltd, Reg: 2025/756709/07.',
  keywords:    ['online shopping', 'South Africa', 'marketplace', 'buy online', 'sell online', 'spaza'],
  authors:     [{ name: 'Eden Extract (Pty) Ltd' }],
  openGraph: {
    type:        'website',
    locale:      'en_ZA',
    siteName:    'Spaza',
    title:       "Spaza – South Africa's Online Marketplace",
    description: 'Shop millions of products from trusted South African sellers.',
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://spaza.co.za'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear()
  return (
    <html lang="en-ZA" className={`${bebasNeue.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body className="bg-gray-50 font-body text-gray-800 antialiased min-h-screen flex flex-col">
        <div className="flex-1">
          {children}
        </div>

        <footer className="mt-auto border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
              <p className="text-xs text-gray-500">
                © {year} Spaza. Operated by Eden Extract (Pty) Ltd · Reg 2025/756709/07
              </p>
              <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                <Link
                  href="/privacy-policy"
                  className="text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/refund-policy"
                  className="text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  Refund Policy
                </Link>
                <Link
                  href="/terms"
                  className="text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  Terms &amp; Conditions
                </Link>
              </nav>
            </div>
          </div>
        </footer>

        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#0A1628',
              color: '#fff',
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 600,
              borderRadius: '10px',
            },
          }}
        />
      </body>
    </html>
  )
}
