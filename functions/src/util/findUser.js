const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const resolve = async (uid) => {
  if (!uid.includes(':::')) return getAuth().getUser(uid);
  const [provider, providerUID] = uid.split(':::');
  const snap = await getFirestore().collection('oauth2')
    .where('provider', '==', provider)
    .where('providerUID', '==', providerUID)
    .get();
  if (snap.size !== 1) return undefined;
  return getAuth().getUser(snap.docs[0].get('UID'));
};

module.exports = async function findUser(uid) {
  if (typeof uid !== 'string' || !uid) return undefined;
  try {
    return await resolve(uid);
  } catch (e) {
    if (e.code === 'auth/user-not-found') return undefined;
    throw e;
  }
};
