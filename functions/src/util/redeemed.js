const { getFirestore } = require('firebase-admin/firestore');

const { normalize } = require('./code');
const { status: { COMPLETED } } = require('./constants');

module.exports = async function redeemed({ code, uid }) {
  const normalized = normalize(code);
  if (!normalized) return undefined;

  const db = getFirestore();
  const [voucher, redemption] = await Promise.all([
    db.doc(`voucher/${normalized}`).get(),
    db.doc(`voucher/${normalized}/redemptions/${uid}`).get(),
  ]);
  if (!voucher.exists || !redemption.exists || redemption.get('status') !== COMPLETED) return undefined;
  return { code: normalized, data: voucher.get('data'), type: voucher.get('type') };
};
