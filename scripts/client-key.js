const path = require('node:path');

const functionsRequire = require('node:module').createRequire(path.join(__dirname, '../functions/'));

const { initializeApp } = functionsRequire('firebase-admin/app');
const { getFirestore } = functionsRequire('firebase-admin/firestore');

const usage = 'Usage: WALLET_CHARGE_SECRET=<secret> node scripts/client-key.js <client id> [--salt=<salt>] [--types=<type,type>] [--create]';

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('--'));
const [id] = args.filter((arg) => !arg.startsWith('--'));
const saltFlag = flags.find((flag) => flag.startsWith('--salt='));
const typesFlag = flags.find((flag) => flag.startsWith('--types='));
const unknown = flags.filter((flag) => flag !== '--create' && flag !== saltFlag && flag !== typesFlag);
const secret = process.env.WALLET_CHARGE_SECRET;

if (!id || !secret || unknown.length) {
  if (unknown.length) console.error(`Unexpected argument: ${unknown.join(' ')}`);
  console.error(usage);
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'feildbase' });

const { clientKey } = require('../functions/src/util/registryClients');

const main = async () => {
  const ref = getFirestore().doc(`voucher-clients/${id}`);
  const existing = await ref.get();
  const requestedSalt = saltFlag ? saltFlag.slice('--salt='.length) : undefined;
  const currentSalt = existing.exists ? existing.get('salt') : undefined;

  if (existing.exists && requestedSalt !== undefined && requestedSalt !== currentSalt) {
    console.error(`Client "${id}" already exists with a different salt; changing it would invalidate its key.`);
    process.exit(1);
  }

  const salt = currentSalt ?? requestedSalt;
  const create = flags.includes('--create') || (existing.exists && existing.get('create') === true);
  const types = typesFlag
    ? typesFlag.slice('--types='.length).split(',').map((type) => type.trim()).filter(Boolean)
    : (existing.exists && existing.get('types')) || [];

  await ref.set({
    create,
    enabled: true,
    types,
    ...(salt ? { salt } : {}),
  }, { merge: true });

  console.error(`${existing.exists ? 'Updated' : 'Registered'} voucher client "${id}" (create: ${create}, types: ${types.join(', ') || 'none'})`);
  console.log(clientKey(secret, id, salt));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
