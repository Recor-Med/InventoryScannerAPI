const fs = require('fs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const jsforce = require('jsforce');

let cachedConnection = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 10 * 60 * 1000; // Salesforce access tokens from JWT flow are valid for a while; refresh periodically to be safe.

/**
 * Authenticates using the OAuth 2.0 JWT Bearer flow. This requires a
 * Connected App in Salesforce configured with a digital certificate
 * (public key uploaded to the Connected App), and the corresponding
 * private key available to this server. No password or security token
 * is involved, and it works regardless of the calling IP address.
 */
async function getConnection() {
  const now = Date.now();
  if (cachedConnection && now - cachedAt < TOKEN_TTL_MS) {
    return cachedConnection;
  }

  const {
    SF_LOGIN_URL,
    SF_USERNAME,
    SF_CLIENT_ID,
    SF_JWT_PRIVATE_KEY,
    SF_JWT_PRIVATE_KEY_PATH,
  } = process.env;

  if (!SF_USERNAME || !SF_CLIENT_ID) {
    throw new Error(
      'Missing Salesforce JWT config. Set SF_USERNAME and SF_CLIENT_ID as environment variables.'
    );
  }

  const privateKey = getPrivateKey(SF_JWT_PRIVATE_KEY, SF_JWT_PRIVATE_KEY_PATH);
  const audience = SF_LOGIN_URL || 'https://login.salesforce.com';

  const token = jwt.sign(
    {
      iss: SF_CLIENT_ID,
      sub: SF_USERNAME,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 60 * 3, // 3 minutes, as per Salesforce's requirement
    },
    privateKey,
    { algorithm: 'RS256' }
  );

  const tokenUrl = `${audience}/services/oauth2/token`;

  const response = await axios.post(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const { access_token: accessToken, instance_url: instanceUrl } = response.data;

  const conn = new jsforce.Connection({
    instanceUrl,
    accessToken,
  });

  cachedConnection = conn;
  cachedAt = now;
  return conn;
}

function getPrivateKey(inlineKey, keyPath) {
  if (inlineKey) {
    // Support keys stored with literal \n sequences (common when stored as
    // a single-line environment variable / Key Vault secret).
    return inlineKey.includes('\\n') ? inlineKey.replace(/\\n/g, '\n') : inlineKey;
  }
  if (keyPath) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  throw new Error(
    'Missing Salesforce JWT private key. Set SF_JWT_PRIVATE_KEY (PEM contents) or SF_JWT_PRIVATE_KEY_PATH (file path).'
  );
}

module.exports = { getConnection };

