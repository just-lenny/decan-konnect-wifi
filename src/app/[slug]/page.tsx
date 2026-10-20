import { Suspense } from 'react';
import Portal from './Portal';

export const dynamic = 'force-dynamic';
export default function Page() { return <Suspense fallback={<div className="empty"><span className="spin" /></div>}><Portal /></Suspense>; }
