const crypto = require('crypto');

module.exports = (body, secret) => crypto.createHmac('sha256', secret)
  .update(body).digest('hex');
