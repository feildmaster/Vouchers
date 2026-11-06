const { getFirestore } = require('firebase-admin/firestore');

const hexSignature = require('./hexSignature');

const COLLECTION = 'voucher-clients';

const clientKey = (secret, id, salt) => hexSignature(salt ? `voucher-${id}:${salt}` : `voucher-${id}`, secret);

const clientTypes = (types) => (Array.isArray(types) ? types.filter((type) => typeof type === 'string') : []);

const registryClients = async (secret) => {
  const snap = await getFirestore().collection(COLLECTION).get();
  return snap.docs
    .filter((doc) => doc.get('enabled') === true)
    .map((doc) => ({ id: doc.id, key: clientKey(secret, doc.id, doc.get('salt')), create: doc.get('create') === true, types: clientTypes(doc.get('types')) }));
};

module.exports = registryClients;
module.exports.clientKey = clientKey;
