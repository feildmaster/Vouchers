const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_SIZE = 4;

exports.generate = () => Array.from({ length: GROUPS }, () => Array.from(
  { length: GROUP_SIZE },
  () => ALPHABET[crypto.randomInt(ALPHABET.length)],
).join('')).join('-');

exports.normalize = (code) => {
  if (typeof code !== 'string') return undefined;
  const compact = code.toUpperCase().replace(/[\s-]/g, '');
  if (!new RegExp(`^[A-Z0-9]{${GROUPS * GROUP_SIZE}}$`).test(compact)) return undefined;
  return compact.match(new RegExp(`.{${GROUP_SIZE}}`, 'g')).join('-');
};
