const { walletSecret } = require('../params');
const hexSignature = require('./hexSignature');

const DEFAULT_URL = 'https://us-central1-feildbase.cloudfunctions.net/wallet-credit';

module.exports = async function walletCredit({ amount, currency, extra, memo, requestId, uid }) {
  const body = JSON.stringify({ amount, currency, extra, memo, requestId, uid });
  const response = await fetch(process.env.WALLET_CREDIT_URL || DEFAULT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      http_x_signature: hexSignature(body, walletSecret.value()),
    },
    body,
  });
  const reply = await response.json();
  if (!response.ok || reply.error || !reply.id) {
    throw new Error(`Wallet credit failed: ${reply.error || response.status}`);
  }
  return reply.id;
};
