const { spawnSync } = require('node:child_process');
const path = require('node:path');

const functionsRequire = require('node:module').createRequire(path.join(__dirname, '../functions/'));

const { initializeApp } = functionsRequire('firebase-admin/app');
const { getFirestore } = functionsRequire('firebase-admin/firestore');

const project = process.env.GCLOUD_PROJECT || 'feildbase';

const usage = [
  'Usage: [WALLET_CHARGE_SECRET=<secret>] node scripts/client-key.js <client id> [--salt=<salt>] [--write] [--create=<type,type>] [--redeem=<type,type>]',
  'Prints the key only. Registering the client in Firestore needs --write, --create or --redeem.',
  'Without WALLET_CHARGE_SECRET the secret is read from gcloud.',
].join('\n');

const gcloud = (args) => (process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'gcloud', ...args], { encoding: 'utf8' })
  : spawnSync('gcloud', args, { encoding: 'utf8' }));

const problemOf = (stderr = '') => {
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.startsWith('ERROR:')) || lines[0] || 'gcloud did not run';
};

const fromGcloud = () => {
  const result = gcloud(['secrets', 'versions', 'access', 'latest', '--secret=WALLET_CHARGE_SECRET', `--project=${project}`]);
  const value = result.status === 0 ? result.stdout.replace(/[\r\n]+$/, '') : '';
  if (value) console.error(`Read WALLET_CHARGE_SECRET from gcloud (${project})`);
  else console.error(`Could not read WALLET_CHARGE_SECRET from gcloud: ${problemOf(result.stderr)}`);
  return value || undefined;
};

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
const write = flags.includes('--write') || create !== undefined || redeem !== undefined;
const unknown = flags.filter((flag) => flag !== '--write' && !['salt', 'create', 'redeem'].some((name) => flag.startsWith(`--${name}=`)));
const secret = process.env.WALLET_CHARGE_SECRET || (id && !unknown.length ? fromGcloud() : undefined);

if (!id || !secret || unknown.length) {
  if (unknown.length) console.error(`Unexpected argument: ${unknown.join(' ')}`);
  console.error(usage);
  process.exit(1);
}

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

const register = async () => {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'feildbase' });
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

const printOnly = async () => {
  console.error('Printed the key only; nothing was registered. Add --write, --create or --redeem to register the client, and --salt if it has one.');
  console.log(clientKey(secret, id, salt));
};

const main = () => (write ? register() : printOnly());

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
