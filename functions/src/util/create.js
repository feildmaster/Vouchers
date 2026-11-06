const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const { generate } = require('./code');
const { invalidRequest, invalidRequestId } = require('./constants');
const types = require('./types');

const MAX_USES = 100_000;
const MAX_ATTEMPTS = 5;

const parseExpiry = (expiresAt) => {
  if (expiresAt === undefined) return undefined;
  if (typeof expiresAt !== 'number' && typeof expiresAt !== 'string') throw invalidRequest;
  const time = new Date(expiresAt).getTime();
  if (!Number.isFinite(time) || time <= Date.now()) throw invalidRequest;
  return new Date(time);
};

module.exports = async function createVoucher({
  createdBy,
  data,
  expiresAt,
  note,
  reservation,
  type,
  uses = 1,
}) {
  if (
    !types.isValid(type, data) ||
    !Number.isSafeInteger(uses) ||
    uses < 1 ||
    uses > MAX_USES ||
    (note !== undefined && typeof note !== 'string')
  ) throw invalidRequest;
  const expiry = parseExpiry(expiresAt);
  const requestKey = JSON.stringify([type, data, expiresAt ?? null, note ?? null]);

  const db = getFirestore();
  const requestRef = reservation
    ? db.doc(`voucher-requests/${reservation.client}:${reservation.requestId}`)
    : undefined;

  const tryCreate = async (attemptsLeft) => {
    if (attemptsLeft === 0) throw new Error('Could not generate a unique voucher code');
    const code = generate();
    const ref = db.doc(`vouchers/${code}`);
    const created = await db.runTransaction(async (t) => {
      const [voucher, request] = await Promise.all([t.get(ref), requestRef && t.get(requestRef)]);
      if (request?.exists) {
        if (request.get('key') !== requestKey) throw invalidRequestId;
        return { code: request.get('code') };
      }
      if (voucher.exists) return undefined;

      t.set(ref, {
        active: !reservation,
        createdBy,
        data,
        date: FieldValue.serverTimestamp(),
        ...(expiry ? { expiresAt: expiry } : {}),
        ...(note ? { note } : {}),
        revoked: false,
        type,
        used: 0,
        uses,
      });
      if (requestRef) {
        t.set(requestRef, {
          client: reservation.client,
          code,
          date: FieldValue.serverTimestamp(),
          key: requestKey,
        });
      }
      return { code };
    });
    return created || tryCreate(attemptsLeft - 1);
  };
  return tryCreate(MAX_ATTEMPTS);
};
