import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CMR Commercial – Eurotrade',
  description: 'Pilotage commercial (prospection, relances, historique)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
