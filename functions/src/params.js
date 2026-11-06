const { defineSecret } = require('firebase-functions/params');

exports.clientSecret = defineSecret('WALLET_CHARGE_SECRET');
exports.walletSecret = defineSecret('WALLET_SECRET');
