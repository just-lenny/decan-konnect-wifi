export type PaymentStatus = 'pending' | 'awaiting_verification' | 'confirmed' | 'failed' | 'cancelled' | 'expired';
export type EntitlementStatus = 'pending_authorization' | 'active' | 'expired' | 'revoked';

/** Mirrors guard_payment_transition() in SQL. A confirmed payment never changes status. */
export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  if (from === 'confirmed') return false;
  if (from === 'pending' || from === 'awaiting_verification') return true;
  return to === 'confirmed'; // late, verified provider callback
}

export function canTransitionEntitlement(from: EntitlementStatus, to: EntitlementStatus): boolean {
  if (from === to) return true;
  if (from === 'pending_authorization') return to === 'active' || to === 'revoked';
  if (from === 'active') return to === 'expired' || to === 'revoked';
  return false;
}
