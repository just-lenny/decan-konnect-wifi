'use client';
import { useState } from 'react';
import { PaymentsManager } from '@/components/managers/PaymentsManager';
import { PaymentSetup } from '@/components/managers/PaymentSetup';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { role } = useBiz(); const [tab, setTab] = useState<'tx' | 'setup'>('tx');
  return <div><h1>Payments</h1>
    {role !== 'staff' && <div className="tabs" role="tablist" style={{ maxWidth: 380 }}><button role="tab" className={tab === 'tx' ? 'on' : ''} onClick={() => setTab('tx')}>Transactions</button><button role="tab" className={tab === 'setup' ? 'on' : ''} onClick={() => setTab('setup')}>M-Pesa setup</button></div>}
    {tab === 'tx' || role === 'staff' ? <PaymentsManager /> : <PaymentSetup />}</div>;
}
