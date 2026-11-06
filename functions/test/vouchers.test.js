const assert = require('node:assert/strict');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');

const createFake = require('./fake');

const CLIENT_SECRET = 'client-secret';
const CODE = 'ABCD-EFGH-JKMN';

let create;
let clientActivate;
let clientCreate;
let fake;
let fetchCalls;
let fetchReply;
let hexSignature;
let originalFetch;
let redeem;
let redeemFor;
let registryClients;
let revoke;

const admin = { auth: { uid: 'boss', token: { admin: true } } };
const member = (uid) => ({ auth: { uid, token: {} } });

const seed = (fields = {}, code = CODE) => fake.store.set(`voucher/${code}`, {
  data: { amount: 50, currency: 'FMC' },
  revoked: false,
  type: 'credit',
  used: 0,
  uses: 1,
  ...fields,
});

const callable = (fn) => ({ run: (data, context = {}) => fn.run({ data, ...context }) });

const expectError = (promise, message) => assert.rejects(promise, (e) => e === message || e.message === message);

beforeEach(() => {
  process.env.WALLET_SECRET = 'wallet-secret';
  process.env.WALLET_CHARGE_SECRET = CLIENT_SECRET;
  fake = createFake();
  fetchCalls = [];
  fetchReply = { ok: true, body: { id: 'tx1' } };
  originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: fetchReply.ok, status: fetchReply.ok ? 200 : 500, json: async () => fetchReply.body };
  };
  Object.keys(require.cache)
    .filter((key) => key.includes(`${path.sep}src${path.sep}`))
    .forEach((key) => delete require.cache[key]);
  hexSignature = require('../src/util/hexSignature');
  registryClients = require('../src/util/registryClients');
  create = callable(require('../src/external/create'));
  revoke = callable(require('../src/external/revoke'));
  redeem = callable(require('../src/external/redeem'));
  redeemFor = require('../src/internal/redeem');
  clientCreate = require('../src/internal/create');
  clientActivate = require('../src/internal/activate');

  fake.users.set('user1', {});
  fake.users.set('user2', {});
});

afterEach(() => {
  global.fetch = originalFetch;
  fake.restore();
});

test('a credit voucher pays the wallet once, signed, and tags the credit with the code', async () => {
  seed();

  const reply = await redeem.run({ code: 'abcd efgh jkmn', type: 'credit' }, member('user1'));

  assert.equal(reply.transaction, 'tx1');
  assert.equal(reply.code, CODE);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].body.requestId, /^voucher-[0-9a-f]{64}$/);
  assert.deepEqual(fetchCalls[0].body, {
    amount: 50,
    currency: 'FMC',
    extra: { voucher: CODE },
    memo: `Voucher ${CODE}`,
    requestId: fetchCalls[0].body.requestId,
    uid: 'user1',
  });
  assert.equal(
    fetchCalls[0].headers.http_x_signature,
    hexSignature(JSON.stringify(fetchCalls[0].body), 'wallet-secret'),
  );
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 1);
  assert.equal(fake.store.get(`voucher/${CODE}/redemptions/user1`).status, 'completed');
});

test('a single-use voucher cannot be redeemed by a second user', async () => {
  seed();
  await redeem.run({ code: CODE, type: 'credit' }, member('user1'));

  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user2')), 'Voucher fully used');
  assert.equal(fetchCalls.length, 1);
});

test('a multi-use voucher serves different users until it runs out, but never the same user twice', async () => {
  seed({ uses: 2 });
  await redeem.run({ code: CODE, type: 'credit' }, member('user1'));

  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user1')), 'Voucher already redeemed');
  await redeem.run({ code: CODE, type: 'credit' }, member('user2'));
  fake.users.set('user3', {});
  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user3')), 'Voucher fully used');
  assert.equal(fetchCalls.length, 2);
});

test('a failed payout releases the voucher so it can be tried again', async () => {
  seed();
  fetchReply = { ok: false, body: { error: 'Invalid wallet' } };

  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user1')), 'Payout failed');
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 0);
  assert.equal(fake.store.has(`voucher/${CODE}/redemptions/user1`), false);

  fetchReply = { ok: true, body: { id: 'tx2' } };
  const reply = await redeem.run({ code: CODE, type: 'credit' }, member('user1'));
  assert.equal(reply.transaction, 'tx2');
});

test('expired, revoked and unknown vouchers are refused without paying', async () => {
  seed({ expiresAt: new Date(Date.now() - 1000) });
  seed({ revoked: true }, 'WXYZ-2345-6789');

  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user1')), 'Voucher expired');
  await expectError(redeem.run({ code: 'WXYZ-2345-6789', type: 'credit' }, member('user1')), 'Voucher not found');
  await expectError(redeem.run({ code: 'AAAA-BBBB-CCCC', type: 'credit' }, member('user1')), 'Voucher not found');
  await expectError(redeem.run({ code: 'nope', type: 'credit' }, member('user1')), 'Voucher not found');
  assert.equal(fetchCalls.length, 0);
});

test('a voucher of another type is returned to the caller and never touches the wallet', async () => {
  seed({ type: 'badge', data: { badge: 'early-bird' } });

  const reply = await redeem.run({ code: CODE, type: 'badge' }, member('user1'));

  assert.equal(reply.type, 'badge');
  assert.deepEqual(reply.data, { badge: 'early-bird' });
  assert.equal(fetchCalls.length, 0);
});

test('redeeming needs a signed-in user', async () => {
  seed();
  await assert.rejects(redeem.run({ code: CODE, type: 'credit' }, {}), { code: 'unauthenticated' });
});

test('only admins create vouchers; single-use is the default', async () => {
  const request = { type: 'credit', data: { amount: 10, currency: 'FMC' } };

  await assert.rejects(create.run(request, member('user1')), { code: 'permission-denied' });
  await assert.rejects(create.run(request, {}), { code: 'unauthenticated' });

  const { code } = await create.run(request, admin);
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const stored = fake.store.get(`voucher/${code}`);
  assert.equal(stored.uses, 1);
  assert.equal(stored.used, 0);
  assert.equal(stored.createdBy, 'boss');
});

test('an admin can create a multi-use voucher with an expiry', async () => {
  const expiresAt = Date.now() + 86400000;
  const { code } = await create.run({
    type: 'credit', data: { amount: 10, currency: 'FMC' }, uses: 25, expiresAt,
  }, admin);

  assert.equal(fake.store.get(`voucher/${code}`).uses, 25);
  assert.equal(fake.store.get(`voucher/${code}`).expiresAt.getTime(), expiresAt);
});

test('invalid vouchers are refused at creation', async () => {
  const bad = [
    { type: 'credit', data: { amount: -5, currency: 'FMC' } },
    { type: 'credit', data: { amount: 1.5, currency: 'FMC' } },
    { type: 'credit', data: { amount: 5 } },
    { type: 'Bad Type', data: {} },
    { type: 'badge', data: 'oops' },
    { type: 'badge', data: {}, uses: 0 },
    { type: 'badge', data: {}, uses: 1.5 },
    { type: 'badge', data: {}, expiresAt: Date.now() - 1 },
    { type: 'badge', data: {}, expiresAt: 'not a date' },
  ];
  await Promise.all(bad.map((request) => assert.rejects(
    create.run(request, admin),
    { code: 'invalid-argument' },
    JSON.stringify(request),
  )));
  assert.equal([...fake.store.keys()].filter((key) => key.startsWith('voucher/')).length, 0);
});

test('revoking a voucher is admin-only and stops redemption', async () => {
  seed();

  await assert.rejects(revoke.run({ code: CODE }, member('user1')), { code: 'permission-denied' });
  await revoke.run({ code: CODE }, admin);
  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user1')), 'Voucher not found');
  await assert.rejects(revoke.run({ code: 'AAAA-BBBB-CCCC' }, admin), { code: 'not-found' });
});

const clientCall = async (body, key) => {
  const rawBody = Buffer.from(JSON.stringify(body));
  const req = {
    rawBody,
    body,
    headers: key === undefined ? {} : { http_x_signature: hexSignature(rawBody, key) },
  };
  const reply = {};
  const res = {
    send(payload) { reply.body = payload; return this; },
    status(code) { reply.status = code; return this; },
  };
  await redeemFor(req, res);
  return reply.body;
};

test('a registered client redeems for a user by uid or linked id', async () => {
  seed();
  seed({ uses: 1 }, 'WXYZ-2345-6789');
  fake.store.set('voucher-clients/bot', { enabled: true, types: ['credit'] });
  fake.store.set('oauth2/link1', { provider: 'discord', providerUID: '42', UID: 'user2' });
  const key = registryClients.clientKey(CLIENT_SECRET, 'bot');

  const direct = await clientCall({ code: CODE, type: 'credit', uid: 'user1' }, key);
  const linked = await clientCall({ code: 'WXYZ-2345-6789', type: 'credit', uid: 'discord:::42' }, key);

  assert.equal(direct.transaction, 'tx1');
  assert.equal(linked.transaction, 'tx1');
  assert.deepEqual(fetchCalls.map((call) => call.body.uid), ['user1', 'user2']);
});

test('unregistered, disabled or unsigned callers cannot redeem through the client endpoint', async () => {
  seed();
  fake.store.set('voucher-clients/off', { enabled: false });
  const body = { code: CODE, uid: 'user1' };

  assert.deepEqual(await clientCall(body), { error: 'Invalid request' });
  assert.deepEqual(await clientCall(body, 'wrong'), { error: 'Invalid request' });
  assert.deepEqual(await clientCall(body, registryClients.clientKey(CLIENT_SECRET, 'off')), { error: 'Invalid request' });
  assert.equal(fetchCalls.length, 0);
});

test('the client endpoint refuses unknown properties and unknown users', async () => {
  seed();
  fake.store.set('voucher-clients/bot', { enabled: true });
  const key = registryClients.clientKey(CLIENT_SECRET, 'bot');

  assert.deepEqual(
    await clientCall({ code: CODE, type: 'credit', uid: 'user1', uses: 99 }, key),
    { error: 'Unknown properties: uses' },
  );
  assert.deepEqual(await clientCall({ code: CODE, type: 'credit', uid: 'ghost' }, key), { error: 'User not found' });
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 0);
});

const clientCreateCall = async (body, key, handler = clientCreate) => {
  const rawBody = Buffer.from(JSON.stringify(body));
  const req = { rawBody, body, headers: { http_x_signature: hexSignature(rawBody, key) } };
  const reply = {};
  const res = {
    send(payload) { reply.body = payload; return this; },
    status(code) { reply.status = code; return this; },
  };
  await handler(req, res);
  return reply.body;
};

test('a client allowed to create mints single-use vouchers of a non-credit type', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');

  const { code } = await clientCreateCall({ type: 'subscription', data: { plan: 'month' }, requestId: 'purchase-0001' }, key);

  const stored = fake.store.get(`voucher/${code}`);
  assert.equal(stored.uses, 1);
  assert.equal(stored.createdBy, 'client:shop');
  assert.equal(stored.type, 'subscription');
});

test('clients cannot mint credit vouchers or multi-use vouchers, even when granted create on credit', async () => {
  fake.store.set('voucher-clients/shop', {
    enabled: true,
    types: { credit: { create: true }, subscription: { create: true } },
  });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');

  assert.deepEqual(
    await clientCreateCall({ type: 'credit', data: { amount: 10, currency: 'FMC' }, requestId: 'purchase-0001' }, key),
    { error: 'Invalid request' },
  );
  assert.deepEqual(
    await clientCreateCall({ type: 'subscription', data: {}, uses: 50, requestId: 'purchase-0001' }, key),
    { error: 'Unknown properties: uses' },
  );
  assert.equal([...fake.store.keys()].filter((k) => k.startsWith('voucher/')).length, 0);
});

test('a client without the create flag cannot mint vouchers', async () => {
  fake.store.set('voucher-clients/bot', { enabled: true });
  const key = registryClients.clientKey(CLIENT_SECRET, 'bot');

  assert.deepEqual(await clientCreateCall({ type: 'subscription', data: {}, requestId: 'purchase-0001' }, key), { error: 'Invalid request' });
});

test('a reserved voucher cannot be redeemed until it is activated', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');
  const { code } = await clientCreateCall({ type: 'subscription', data: {}, requestId: 'purchase-0001' }, key);
  assert.equal(fake.store.get(`voucher/${code}`).active, false);

  await expectError(redeem.run({ code, type: 'subscription' }, member('user1')), 'Voucher not found');

  assert.deepEqual(await clientCreateCall({ requestId: 'purchase-0001' }, key, clientActivate), { code });
  assert.deepEqual(await clientCreateCall({ requestId: 'purchase-0001' }, key, clientActivate), { code });
  const reply = await redeem.run({ code, type: 'subscription' }, member('user1'));
  assert.equal(reply.type, 'subscription');
});

test('repeating a reservation returns the same code, and changing it is refused', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');
  const body = { type: 'subscription', data: { plan: 'month' }, requestId: 'purchase-0001' };

  const first = await clientCreateCall(body, key);
  const second = await clientCreateCall(body, key);

  assert.deepEqual(second, first);
  assert.deepEqual(
    await clientCreateCall({ ...body, data: { plan: 'year' } }, key),
    { error: 'Invalid request id' },
  );
  const stored = [...fake.store.keys()].filter((path) => path.split('/').length === 2 && path.startsWith('voucher/'));
  assert.equal(stored.length, 1);
});

test('reserving needs a valid request id', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');

  assert.deepEqual(
    await clientCreateCall({ type: 'subscription', data: {} }, key),
    { error: 'Invalid request id' },
  );
  assert.deepEqual(
    await clientCreateCall({ type: 'subscription', data: {}, requestId: 'short' }, key),
    { error: 'Invalid request id' },
  );
});

test('activation needs a known request id and the create permission', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  fake.store.set('voucher-clients/bot', { enabled: true });
  const shopKey = registryClients.clientKey(CLIENT_SECRET, 'shop');
  const botKey = registryClients.clientKey(CLIENT_SECRET, 'bot');

  assert.deepEqual(
    await clientCreateCall({ requestId: 'purchase-9999' }, shopKey, clientActivate),
    { error: 'Invalid request id' },
  );
  assert.deepEqual(
    await clientCreateCall({ requestId: 'purchase-9999' }, botKey, clientActivate),
    { error: 'Invalid request id' },
  );
});

test('the redeem callable needs a type, and a voucher of another type is refused without being used', async () => {
  seed({ type: 'badge', data: { badge: 'early-bird' } });

  await assert.rejects(redeem.run({ code: CODE }, member('user1')), { code: 'invalid-argument' });
  await expectError(redeem.run({ code: CODE, type: 'subscription' }, member('user1')), 'Voucher not found');
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 0);

  const reply = await redeem.run({ code: CODE, type: 'badge' }, member('user1'));
  assert.equal(reply.type, 'badge');
});

test('a client can only redeem the types it is registered for, and an unlisted client redeems nothing', async () => {
  seed({ type: 'subscription', data: { plan: 'month' } });
  fake.store.set('voucher-clients/site', { enabled: true, types: ['badge'] });
  fake.store.set('voucher-clients/bare', { enabled: true });
  fake.store.set('voucher-clients/shop', { enabled: true, types: ['subscription'] });
  const body = { code: CODE, type: 'subscription', uid: 'user1' };

  assert.deepEqual(await clientCall(body, registryClients.clientKey(CLIENT_SECRET, 'site')), { error: 'Voucher not found' });
  assert.deepEqual(await clientCall(body, registryClients.clientKey(CLIENT_SECRET, 'bare')), { error: 'Voucher not found' });
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 0);

  const reply = await clientCall(body, registryClients.clientKey(CLIENT_SECRET, 'shop'));
  assert.equal(reply.type, 'subscription');
});

test('the client endpoint needs a type, and the type must be one the client is registered for', async () => {
  seed({ type: 'subscription', data: { plan: 'month' } });
  fake.store.set('voucher-clients/shop', { enabled: true, types: ['subscription'] });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');

  assert.deepEqual(await clientCall({ code: CODE, uid: 'user1' }, key), { error: 'Invalid request' });
  assert.deepEqual(
    await clientCall({ code: CODE, type: 'badge', uid: 'user1' }, key),
    { error: 'Voucher not found' },
  );
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 0);
});

test('create and redeem are granted per type, and the list form only grants redeem', async () => {
  seed({ type: 'badge', data: {} });
  fake.store.set('voucher-clients/mixed', {
    enabled: true,
    types: { badge: { redeem: true }, subscription: { create: true } },
  });
  fake.store.set('voucher-clients/listed', { enabled: true, types: ['badge'] });
  const mixed = registryClients.clientKey(CLIENT_SECRET, 'mixed');
  const listed = registryClients.clientKey(CLIENT_SECRET, 'listed');
  const reserve = (type) => ({ type, data: {}, requestId: 'purchase-0001' });

  assert.ok((await clientCreateCall(reserve('subscription'), mixed)).code);
  assert.deepEqual(await clientCreateCall(reserve('badge'), mixed), { error: 'Invalid request' });
  assert.deepEqual(await clientCreateCall(reserve('badge'), listed), { error: 'Invalid request' });

  assert.deepEqual(
    await clientCall({ code: CODE, type: 'subscription', uid: 'user1' }, mixed),
    { error: 'Voucher not found' },
  );
  assert.equal((await clientCall({ code: CODE, type: 'badge', uid: 'user1' }, listed)).type, 'badge');
});

test('activation needs create permission on the type that was reserved', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');
  const { code } = await clientCreateCall({ type: 'subscription', data: {}, requestId: 'purchase-0001' }, key);

  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { redeem: true } } });

  assert.deepEqual(await clientCreateCall({ requestId: 'purchase-0001' }, key, clientActivate), { error: 'Invalid request' });
  assert.equal(fake.store.get(`voucher/${code}`).active, false);
});

test('a reservation is marked for deletion until it is activated, and an activated voucher never is', async () => {
  fake.store.set('voucher-clients/shop', { enabled: true, types: { subscription: { create: true } } });
  const key = registryClients.clientKey(CLIENT_SECRET, 'shop');
  const before = Date.now();
  const { code } = await clientCreateCall({ type: 'subscription', data: {}, requestId: 'purchase-0001' }, key);

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const reserved = fake.store.get(`voucher/${code}`).deleteAt.getTime();
  assert.ok(reserved >= before + thirtyDays && reserved <= Date.now() + thirtyDays);
  assert.equal(fake.store.get('voucher-requests/shop:purchase-0001').deleteAt.getTime(), reserved);

  await clientCreateCall({ requestId: 'purchase-0001' }, key, clientActivate);

  assert.equal(fake.store.get(`voucher/${code}`).deleteAt, null);
  assert.equal(fake.store.get('voucher-requests/shop:purchase-0001').deleteAt.getTime(), reserved);
});

test('vouchers an admin creates are never marked for deletion', async () => {
  const { code } = await create.run({ type: 'badge', data: {} }, admin);

  assert.equal('deleteAt' in fake.store.get(`voucher/${code}`), false);
});

const strand = (uid, ageMs) => fake.store.set(`voucher/${CODE}/redemptions/${uid}`, {
  date: new Date(Date.now() - ageMs),
  status: 'pending',
});

test('a redemption stranded as pending is finished by a retry without using the voucher up twice', async () => {
  seed({ used: 1 });
  strand('user1', 10 * 60 * 1000);

  const reply = await redeem.run({ code: CODE, type: 'credit' }, member('user1'));

  assert.equal(reply.transaction, 'tx1');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 1);
  assert.equal(fake.store.get(`voucher/${CODE}/redemptions/user1`).status, 'completed');
});

test('a retried payout carries the same request id, and each user gets their own', async () => {
  seed({ used: 1, uses: 3 });
  strand('user1', 10 * 60 * 1000);

  await redeem.run({ code: CODE, type: 'credit' }, member('user1'));
  strand('user1', 10 * 60 * 1000);
  await redeem.run({ code: CODE, type: 'credit' }, member('user1'));
  await redeem.run({ code: CODE, type: 'credit' }, member('user2'));

  const ids = fetchCalls.map((call) => call.body.requestId);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[0], ids[2]);
});

test('a pending redemption that is still recent is left alone', async () => {
  seed({ used: 1 });
  strand('user1', 10 * 1000);

  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user1')), 'Redemption in progress');
  assert.equal(fetchCalls.length, 0);
  assert.equal(fake.store.get(`voucher/${CODE}`).used, 1);
});

test('a stranded redemption does not hold a use for anyone else, and a failed retry releases it', async () => {
  seed({ used: 1 });
  strand('user1', 10 * 60 * 1000);
  fetchReply = { ok: false, body: { error: 'Invalid wallet' } };

  await expectError(redeem.run({ code: CODE, type: 'credit' }, member('user1')), 'Payout failed');

  assert.equal(fake.store.get(`voucher/${CODE}`).used, 0);
  assert.equal(fake.store.has(`voucher/${CODE}/redemptions/user1`), false);
});
