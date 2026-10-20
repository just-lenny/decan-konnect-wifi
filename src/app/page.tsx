import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '14vh 1.2rem' }}>
      <div className="row mb"><span className="logo" aria-hidden>DK</span><b style={{ color: 'var(--gd)' }}>Decan Konnect Internet Services</b></div>
      <h1 style={{ fontSize: '2.2rem' }}>Sell Wi-Fi from your own portal, paid to your own M-Pesa.</h1>
      <p className="muted" style={{ fontSize: '1.05rem', maxWidth: 560 }}>Cybercafés, hotels, apartments and hotspot owners get a branded captive portal, vouchers and per-package pricing. Customers never create an account.</p>
      <div className="row mt"><Link className="btn" href="/register">Register your business</Link><Link className="btn alt" href="/login">Sign in</Link></div>
    </main>
  );
}
