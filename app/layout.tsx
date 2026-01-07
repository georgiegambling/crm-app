import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import WelcomeOverlay from '@/components/welcome-overlay'
import CallbackAlerts from '@/components/callbackalerts' 

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Triple 555 CRM',
  description: 'Triple 555 CRM',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <WelcomeOverlay />

        {/* ✅ Global callback alerts (runs on every page that uses this layout) */}
        <CallbackAlerts />

        {children}
      </body>
    </html>
  )
}
