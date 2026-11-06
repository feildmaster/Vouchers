const path = require('node:path');

const functionsRequire = require('node:module').createRequire(path.join(__dirname, '../functions/'));

const { initializeApp } = functionsRequire('firebase-admin/app');
const { getFirestore } = functionsRequire('firebase-admin/firestore');

const usage = 'Usage: WALLET_CHARGE_SECRET=<secret> node scripts/client-key.js <client id> [--salt=<salt>] [--create=<type,type>] [--redeem=<type,type>]';

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('--'));
const [id] = args.filter((arg) => !arg.startsWith('--'));
const flagValue = (name) => {
  const flag = flags.find((candidate) => candidate.startsWith(`--${name}=`));
  return flag === undefined ? undefined : flag.slice(name.length + 3);
};
const salt = flagValue('salt');
const create = flagValue('create');
const redeem = flagValue('redeem');
const unknown = flags.filter((flag) => !['salt', 'create', 'redeem'].some((name) => flag.startsWith(`--${name}=`)));
const secret = process.env.WALLET_CHARGE_SECRET;

if (!id || !secret || unknown.length) {
  if (unknown.length) console.error(`Unexpected argument: ${unknown.join(' ')}`);
  console.error(usage);
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'feildbase' });

const { clientKey, clientTypes } = require('../functions/src/util/registryClients');

const list = (value) => value.split(',').map((type) => type.trim()).filter(Boolean);

const withPermission = (types, permission, names) => {
  const next = Object.fromEntries(Object.entries(types)
    .map(([type, granted]) => [type, { ...granted, [permission]: false }]));
  names.forEach((name) => {
    next[name] = { create: false, redeem: false, ...next[name], [permission]: true };
  });
  return Object.fromEntries(Object.entries(next).filter(([, granted]) => granted.create || granted.redeem));
};

const main = async () => {
  const ref = getFirestore().doc(`voucher-clients/${id}`);
  const existing = await ref.get();
  const currentSalt = existing.exists ? existing.get('salt') : undefined;

  if (existing.exists && salt !== undefined && salt !== currentSalt) {
    console.error(`Client "${id}" already exists with a different salt; changing it would invalidate its key.`);
    process.exit(1);
  }

  const finalSalt = currentSalt ?? salt;
  const stored = clientTypes(existing.exists ? existing.get('types') : undefined);
  const withCreate = create === undefined ? stored : withPermission(stored, 'create', list(create));
  const types = redeem === undefined ? withCreate : withPermission(withCreate, 'redeem', list(redeem));

  await ref.set({
    enabled: true,
    types,
    ...(finalSalt ? { salt: finalSalt } : {}),
  });

  const summary = Object.entries(types)
    .map(([type, granted]) => `${type}: ${['create', 'redeem'].filter((p) => granted[p]).join('+')}`)
    .join(', ');
  console.error(`${existing.exists ? 'Updated' : 'Registered'} voucher client "${id}" (${summary || 'no types'})`);
  console.log(clientKey(secret, id, finalSalt));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
