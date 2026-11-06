const admin = require('firebase-admin');
admin.initializeApp();

exports.vouchers = require('./src');
