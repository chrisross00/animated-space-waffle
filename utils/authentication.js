const admin = require('firebase-admin');

async function validateIdToken(req) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new Error('Missing or malformed Authorization header');
    }
    const idToken = header.split('Bearer ')[1];

    // Dev auth bypass — only active when DEV_AUTH_BYPASS_UID is set and not in production
    if (
      process.env.DEV_AUTH_BYPASS_UID &&
      process.env.NODE_ENV !== 'production' &&
      idToken === 'dev-bypass'
    ) {
      return { uid: process.env.DEV_AUTH_BYPASS_UID };
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  }

  module.exports = {
    validateIdToken
  }