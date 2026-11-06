const { getFirestore } = require('firebase-admin/firestore');

const hexSignature = require('./hexSignature');

const COLLECTION = 'voucher-clients';

const clientKey = (secret, id, salt) => hexSignature(salt ? `voucher-${id}:${salt}` : `voucher-${id}`, secret);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const permissions = ({ create, redeem } = {}) => ({ create: create === true, redeem: redeem === true });

const clientTypes = (types) => {
  if (Array.isArray(types)) {
    return Object.fromEntries(types
      .filter((type) => typeof type === 'string')
      .map((type) => [type, permissions({ redeem: true })]));
  }
  if (!isPlainObject(types)) return {};
  return Object.fromEntries(Object.entries(types)
    .map(([type, granted]) => [type, permissions(isPlainObject(granted) ? granted : {})]));
};

const allows = (client, type, permission) => Object.hasOwn(client.types, type)
  && client.types[type][permission] === true;

const registryClients = async (secret) => {
  const snap = await getFirestore().collection(COLLECTION).get();
  return snap.docs
    .filter((doc) => doc.get('enabled') === true)
    .map((doc) => ({ id: doc.id, key: clientKey(secret, doc.id, doc.get('salt')), types: clientTypes(doc.get('types')) }));
};

module.exports = registryClients;
module.exports.allows = allows;
module.exports.clientKey = clientKey;
module.exports.clientTypes = clientTypes;
