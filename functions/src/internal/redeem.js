const functions = require('firebase-functions/v1');

const checkBody = require('../util/checkBody');
const { invalidRequest, invalidUser } = require('../util/constants');
const findUser = require('../util/findUser');
const { clientSecret, walletSecret } = require('../params');
const redeem = require('../util/redeem');
const registryClients = require('../util/registryClients');
const signatureMatches = require('../util/signatureMatches');

const FIELDS = ['code', 'type', 'uid'];

module.exports = functions.runWith({ secrets: [clientSecret, walletSecret] }).https.onRequest(async (req, res) => {
  const clients = await registryClients(clientSecret.value());
  const client = clients.find(({ key }) => signatureMatches(req, key));
  if (!client) return res.send({ error: invalidRequest });

  const bodyError = checkBody(req.body, FIELDS);
  if (bodyError) return res.send({ error: bodyError });

  const { code, type, uid } = req.body;
  if (typeof code !== 'string' || typeof type !== 'string' || !type || typeof uid !== 'string' || !uid) {
    return res.send({ error: invalidRequest });
  }

  try {
    const user = await findUser(uid);
    if (!user) return res.send({ error: invalidUser });
    return res.send(await redeem({ allowedTypes: registryClients.allows(client, type, 'redeem') ? [type] : [], code, uid: user.uid }));
  } catch (e) {
    if (typeof e === 'string') return res.send({ error: e });
    console.error(e);
    return res.status(500).send({ error: 'Failed' });
  }
});
