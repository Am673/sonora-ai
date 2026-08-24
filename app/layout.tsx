import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata={title:'Sonora AI — AI Music Studio',description:'AI mastering, mixing, mashups and song generation.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
