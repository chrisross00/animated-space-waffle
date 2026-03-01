const admin = require('firebase-admin');

async function validateIdToken(req) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new Error('Missing or malformed Authorization header');
    }
    const idToken = header.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  }

  module.exports = {
    validateIdToken
  }