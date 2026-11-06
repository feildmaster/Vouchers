const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_SIZE = 4;
const MIN_GROUPS = 3;
const MAX_GROUPS = 6;

exports.generate = () => Array.from({ length: GROUPS }, () => Array.from(
  { length: GROUP_SIZE },
  () => ALPHABET[crypto.randomInt(ALPHABET.length)],
).join('')).join('-');

exports.normalize = (code) => {
  if (typeof code !== 'string') return undefined;
  const compact = code.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]+$/.test(compact)) return undefined;
  if (compact.length % GROUP_SIZE !== 0) return undefined;
  const groups = compact.length / GROUP_SIZE;
  if (groups < MIN_GROUPS || groups > MAX_GROUPS) return undefined;
  return compact.match(new RegExp(`.{${GROUP_SIZE}}`, 'g')).join('-');
};
