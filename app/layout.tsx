import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Kevin’s Mobile Grooming | Request a visit',description:'Request a grooming visit at your door. Kevin will personally confirm your appointment.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
