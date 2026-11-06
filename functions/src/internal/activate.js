const { onRequest } = require('firebase-functions/v2/https');

const activate = require('../util/activate');
const checkBody = require('../util/checkBody');
const { invalidRequest, invalidRequestId } = require('../util/constants');
const { clientSecret } = require('../params');
const isRequestId = require('../util/requestId');
const registryClients = require('../util/registryClients');
const signatureMatches = require('../util/signatureMatches');

const FIELDS = ['requestId'];

module.exports = onRequest({ secrets: [clientSecret] }, async (req, res) => {
  const clients = await registryClients(clientSecret.value());
  const client = clients.find(({ key }) => signatureMatches(req, key));
  if (!client) return res.send({ error: invalidRequest });

  const bodyError = checkBody(req.body, FIELDS);
  if (bodyError) return res.send({ error: bodyError });

  const { requestId } = req.body;
  if (!isRequestId(requestId)) return res.send({ error: invalidRequestId });

  try {
    return res.send(await activate({
      canCreate: (type) => registryClients.allows(client, type, 'create'),
      client: client.id,
      requestId,
    }));
  } catch (e) {
    if (typeof e === 'string') return res.send({ error: e });
    console.error(e);
    return res.status(500).send({ error: 'Failed' });
  }
});
