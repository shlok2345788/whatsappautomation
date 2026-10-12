const admin = require('firebase-admin');
require('dotenv').config();

// Helper: strip accidental JSON string delimiters (e.g. leading/trailing quotes and commas)
// that can occur when copy-pasting values directly from a JSON file.
const cleanEnv = (val) => val?.trim().replace(/^"+|"+,?$/g, '');

const projectId = cleanEnv(process.env.project_id || process.env.FIREBASE_PROJECT_ID);
const clientEmail = cleanEnv(process.env.client_email || process.env.FIREBASE_CLIENT_EMAIL);
let privateKey = cleanEnv(process.env.private_key || process.env.FIREBASE_PRIVATE_KEY);

if (privateKey) {
  // Replace literal '\n' sequences with actual newline characters
  privateKey = privateKey.replace(/\\n/g, '\n');
}

if (!admin.apps.length) {
  if (projectId && clientEmail && privateKey && !privateKey.includes('test')) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('[Firebase Admin] Successfully initialized Firebase Admin SDK');
    } catch (err) {
      console.error('[Firebase Admin] Failed to initialize Firebase Admin SDK:', err.message);
    }
  } else {
    console.warn('[Firebase Admin] Missing or placeholder credentials in server/.env.');
    console.warn('[Firebase Admin] Please add your Firebase Service Account credentials (project_id, client_email, private_key).');
  }
}

module.exports = { admin };
