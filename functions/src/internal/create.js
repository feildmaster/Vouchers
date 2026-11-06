const functions = require('firebase-functions/v1');

const checkBody = require('../util/checkBody');
const { invalidRequest, invalidRequestId } = require('../util/constants');
const create = require('../util/create');
const { clientSecret } = require('../params');
const isRequestId = require('../util/requestId');
const registryClients = require('../util/registryClients');
const signatureMatches = require('../util/signatureMatches');

const FIELDS = ['data', 'expiresAt', 'note', 'requestId', 'type'];

module.exports = functions.runWith({ secrets: [clientSecret] }).https.onRequest(async (req, res) => {
  const clients = await registryClients(clientSecret.value());
  const client = clients.find(({ create: allowed, key }) => allowed && signatureMatches(req, key));
  if (!client) return res.send({ error: invalidRequest });

  const bodyError = checkBody(req.body, FIELDS);
  if (bodyError) return res.send({ error: bodyError });

  const { data, expiresAt, note, requestId, type } = req.body;
  if (!isRequestId(requestId)) return res.send({ error: invalidRequestId });
  if (type === 'credit') return res.send({ error: invalidRequest });

  try {
    return res.send(await create({
      createdBy: `client:${client.id}`,
      data,
      expiresAt,
      note,
      reservation: { client: client.id, requestId },
      type,
    }));
  } catch (e) {
    if (typeof e === 'string') return res.send({ error: e });
    console.error(e);
    return res.status(500).send({ error: 'Failed' });
  }
});
