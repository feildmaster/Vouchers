const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const { normalize } = require('./code');
const {
  alreadyRedeemed,
  expiredVoucher,
  invalidVoucher,
  payoutFailed,
  redemptionInProgress,
  usedVoucher,
  status: {
    COMPLETED,
    PENDING,
  },
} = require('./constants');
const types = require('./types');

const LEASE = 2 * 60 * 1000;

module.exports = async function redeem({ allowedTypes, code, uid }) {
  const normalized = normalize(code);
  if (!normalized) throw invalidVoucher;

  const db = getFirestore();
  const voucherRef = db.doc(`voucher/${normalized}`);
  const redemptionRef = db.doc(`voucher/${normalized}/redemptions/${uid}`);

  const { data, type } = await db.runTransaction(async (t) => {
    const [voucher, redemption] = await Promise.all([t.get(voucherRef), t.get(redemptionRef)]);
    if (
      !voucher.exists ||
      voucher.get('revoked') === true ||
      voucher.get('active') === false ||
      !allowedTypes.includes(voucher.get('type'))
    ) throw invalidVoucher;

    const expiresAt = voucher.get('expiresAt');
    if (expiresAt && expiresAt.toMillis() <= Date.now()) throw expiredVoucher;
    const resuming = redemption.exists && redemption.get('status') === PENDING;
    if (redemption.exists && !resuming) throw alreadyRedeemed;
    if (resuming && Date.now() - redemption.get('date').toMillis() < LEASE) throw redemptionInProgress;

    if (!resuming) {
      const used = voucher.get('used');
      if (used >= voucher.get('uses')) throw usedVoucher;
      t.update(voucherRef, { used: used + 1 });
    }
    t.set(redemptionRef, { date: FieldValue.serverTimestamp(), status: PENDING });
    return { data: voucher.get('data'), type: voucher.get('type') };
  });

  let result;
  try {
    result = await types.apply({ code: normalized, data, type, uid });
  } catch (e) {
    console.error(e);
    await db.runTransaction(async (t) => {
      const voucher = await t.get(voucherRef);
      t.update(voucherRef, { used: voucher.get('used') - 1 });
      t.delete(redemptionRef);
    });
    throw payoutFailed;
  }

  await redemptionRef.update({ ...result, status: COMPLETED });
  return { code: normalized, data, type, ...result };
};
