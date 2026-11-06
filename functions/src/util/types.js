const { createHash } = require('node:crypto');

const walletCredit = require('./walletCredit');

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_DATA_LENGTH = 4_000;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const handlers = {
  credit: {
    validate: ({ amount, currency, memo }) => Number.isSafeInteger(amount)
      && amount > 0
      && typeof currency === 'string'
      && currency.length > 0
      && (memo === undefined || (typeof memo === 'string' && memo.trim().length > 0)),
    apply: async ({ code, data, uid }) => ({
      transaction: await walletCredit({
        amount: data.amount,
        currency: data.currency,
        extra: { voucher: code },
        memo: data.memo || `Voucher ${code}`,
        requestId: `voucher-${createHash('sha256').update(`${code}\n${uid}`).digest('hex')}`,
        uid,
      }),
    }),
  },
};

exports.isValid = (type, data) => {
  if (typeof type !== 'string' || !TYPE_PATTERN.test(type) || !isPlainObject(data)) return false;
  if (JSON.stringify(data).length > MAX_DATA_LENGTH) return false;
  return !Object.hasOwn(handlers, type) || handlers[type].validate(data);
};

exports.apply = async (args) => (Object.hasOwn(handlers, args.type) ? handlers[args.type].apply(args) : {});
