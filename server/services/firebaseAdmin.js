const admin = require('firebase-admin');
require('dotenv').config();

// Helper: strip accidental JSON string delimiters (e.g. leading/trailing quotes and commas)
// that can occur when copy-pasting values directly from a JSON file.
const cleanEnv = (val) => val?.trim().replace(/^"+|"+,?$/g, '');

if (!admin.apps.length) {
  const privateKey = cleanEnv(process.env.private_key)?.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: cleanEnv(process.env.project_id),
      clientEmail: cleanEnv(process.env.client_email),
      privateKey,
    }),
  });
}

module.exports = { admin };
