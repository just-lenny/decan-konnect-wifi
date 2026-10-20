import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateSlug } from '../../src/lib/slug.ts';
import { computeExpiry, isAllowedDuration, isAvailableNow } from '../../src/lib/durations.ts';
import { normalizeKenyanPhone, normalizeMac, isValidShortcode, isValidReceipt } from '../../src/lib/formats.ts';
import { generateVoucherCode, hashVoucher, normalizeVoucherInput, encryptJson, decryptJson } from '../../src/lib/crypto.ts';
import { canTransitionPayment, canTransitionEntitlement } from '../../src/lib/transitions.ts';
import { buildStkPayload, darajaTimestamp, parseCallback, stkPassword } from '../../src/lib/mpesa.ts';
import { buildCommandScript } from '../../src/lib/routeros.ts';

test('slugify + validate', () => {
  assert.equal(slugify('Decan Cyber'), 'decan-cyber');
  assert.equal(slugify('  Café  --  Wi-Fi!! '), 'cafe-wi-fi');
  assert.equal(validateSlug('decan-cyber'), null);
  for (const bad of ['admin', 'api', 'login', 'dashboard', 'settings', 'support', 'Ab', 'a', '-x-', 'a--b', 'has space', 'UPPER'])
    assert.notEqual(validateSlug(bad), null, bad);
});

test('durations whitelist', () => {
  assert.ok(isAllowedDuration('minute', 45)); assert.ok(isAllowedDuration('month', 1));
  assert.ok(!isAllowedDuration('minute', 20)); assert.ok(!isAllowedDuration('month', 2)); assert.ok(!isAllowedDuration('day', 30));
});

test('calendar month expiry in Nairobi time, clamped to month end', () => {
  // 31 Jan 2027 10:00 EAT = 07:00Z -> 28 Feb 2027 10:00 EAT
  assert.equal(computeExpiry(new Date('2027-01-31T07:00:00Z'), 'month', 1).toISOString(), '2027-02-28T07:00:00.000Z');
  assert.equal(computeExpiry(new Date('2028-01-31T07:00:00Z'), 'month', 1).toISOString(), '2028-02-29T07:00:00.000Z');
  assert.equal(computeExpiry(new Date('2026-12-15T21:30:00Z'), 'month', 1).toISOString(), '2027-01-15T21:30:00.000Z');
  assert.equal(computeExpiry(new Date('2026-10-19T00:00:00Z'), 'hour', 5).toISOString(), '2026-10-19T05:00:00.000Z');
  assert.equal(computeExpiry(new Date('2026-10-19T00:00:00Z'), 'day', 7).toISOString(), '2026-10-26T00:00:00.000Z');
});

test('schedule availability (Nairobi)', () => {
  assert.ok(isAvailableNow(null));
  // 2026-10-19 is Monday; 06:00Z = 09:00 EAT
  const t = new Date('2026-10-19T06:00:00Z');
  assert.ok(isAvailableNow({ days: [1], from: '08:00', to: '18:00' }, t));
  assert.ok(!isAvailableNow({ days: [2], from: '08:00', to: '18:00' }, t));
  assert.ok(!isAvailableNow({ days: [1], from: '10:00', to: '18:00' }, t));
});

test('formats', () => {
  assert.equal(normalizeKenyanPhone('0712 345 678'), '254712345678');
  assert.equal(normalizeKenyanPhone('+254112345678'), '254112345678');
  assert.equal(normalizeKenyanPhone('12345'), null);
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('nonsense'), null);
  assert.ok(isValidShortcode('174379')); assert.ok(!isValidShortcode('12ab'));
  assert.ok(isValidReceipt('sgl4x8ab12')); assert.ok(!isValidReceipt('short'));
});

test('voucher codes: unique, normalised, hashed per business', () => {
  const set = new Set(Array.from({ length: 5000 }, generateVoucherCode));
  assert.equal(set.size, 5000);
  const code = generateVoucherCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeVoucherInput(code.toLowerCase().replace(/-/g, ' ')), code);
  assert.equal(normalizeVoucherInput('short'), null);
  const pepper = 'p'.repeat(32);
  assert.notEqual(hashVoucher('biz-a', code, pepper), hashVoucher('biz-b', code, pepper)); // cross-business isolation
  assert.equal(hashVoucher('biz-a', code, pepper), hashVoucher('biz-a', code, pepper));
});

test('secret encryption round-trip and tamper detection', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const ct = encryptJson({ consumer_key: 'abc', passkey: 'xyz' }, key);
  assert.deepEqual(decryptJson(ct, key), { consumer_key: 'abc', passkey: 'xyz' });
  assert.ok(!ct.includes('abc'));
  const parts = ct.split('.'); parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptJson(parts.join('.'), key));
  assert.throws(() => decryptJson(ct, Buffer.alloc(32, 8).toString('base64')));
});

test('state machines', () => {
  assert.ok(!canTransitionPayment('confirmed', 'failed'));   // router outage must never downgrade a paid order
  assert.ok(!canTransitionPayment('confirmed', 'pending'));
  assert.ok(canTransitionPayment('pending', 'confirmed'));
  assert.ok(canTransitionPayment('expired', 'confirmed'));   // late verified callback
  assert.ok(!canTransitionPayment('failed', 'pending'));
  assert.ok(canTransitionEntitlement('pending_authorization', 'active'));
  assert.ok(!canTransitionEntitlement('expired', 'active'));
  assert.ok(!canTransitionEntitlement('revoked', 'active'));
});

test('daraja payloads', () => {
  assert.equal(darajaTimestamp(new Date('2026-10-19T09:05:07Z')), '20261019120507');
  assert.equal(stkPassword('174379', 'pk', '20261019120507'), Buffer.from('174379pk20261019120507').toString('base64'));
  const till = buildStkPayload({ env: 'sandbox', method: 'till', shortcode: '123456', partyB: '654321', consumerKey: 'k', consumerSecret: 's', passkey: 'p' },
    { amount: 20, phone: '254712345678', callbackUrl: 'https://x/cb', accountRef: 'DECAN-CYBER-LONG', desc: 'WiFi package purchase' });
  assert.equal(till.TransactionType, 'CustomerBuyGoodsOnline'); assert.equal(till.PartyB, '654321'); assert.equal(till.AccountReference.length, 12);
  const pb = buildStkPayload({ env: 'production', method: 'paybill', shortcode: '600000', partyB: '600000', consumerKey: 'k', consumerSecret: 's', passkey: 'p' },
    { amount: 5, phone: '254712345678', callbackUrl: 'https://x/cb', accountRef: 'A', desc: 'd' });
  assert.equal(pb.TransactionType, 'CustomerPayBillOnline');
});

test('callback parsing', () => {
  const ok = parseCallback({ Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'ok',
    CallbackMetadata: { Item: [{ Name: 'Amount', Value: 20 }, { Name: 'MpesaReceiptNumber', Value: 'SGL4X8AB12' }, { Name: 'PhoneNumber', Value: 254712345678 }] } } } });
  assert.equal(ok?.amount, 20); assert.equal(ok?.receipt, 'SGL4X8AB12'); assert.equal(ok?.resultCode, 0);
  const cancelled = parseCallback({ Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'ws_CO_2', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } });
  assert.equal(cancelled?.resultCode, 1032); assert.equal(cancelled?.receipt, undefined);
  assert.equal(parseCallback({ nope: true }), null);
});

test('router script generation only accepts validated input', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const s = buildCommandScript([{ id, type: 'authorize', mac: 'AA:BB:CC:DD:EE:FF', entitlement_id: id, seconds: 3600, data_limit_mb: 500, down_kbps: 2048, up_kbps: 1024, max_devices: 1 }], 'https://x/api/v1/router/agent', 'tok');
  assert.match(s, /limit-uptime=3600s/); assert.match(s, /limit-bytes-total=524288000/); assert.match(s, /rate-limit="1024k\/2048k"/);
  assert.throws(() => buildCommandScript([{ id, type: 'revoke', mac: 'AA:BB"; /system reset-configuration; "', entitlement_id: id }], 'b', 't'));
  assert.throws(() => buildCommandScript([{ id: 'x"; /x', type: 'revoke', mac: 'AA:BB:CC:DD:EE:FF', entitlement_id: id }], 'b', 't'));
});
