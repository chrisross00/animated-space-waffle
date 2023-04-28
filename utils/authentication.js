const admin = require('firebase-admin');

async function validateIdToken(req) {
    // Verify the Firebase ID token
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const idToken = header.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return decodedToken;
    }
  }

  module.exports = {
    validateIdToken
  }