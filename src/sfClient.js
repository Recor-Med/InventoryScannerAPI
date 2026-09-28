const jsforce = require('jsforce');

let cachedConnection = null;
let cachedAt = 0;
const CONNECTION_TTL_MS = 25 * 60 * 1000; // Salesforce session ~ valid for a while; refresh periodically.

/**
 * Logs into Salesforce using the integration user's username/password +
 * security token (the simplest flow to set up with an admin-provisioned
 * integration user). Caches the connection so we don't re-login on every
 * request.
 */
async function getConnection() {
  const now = Date.now();
  if (cachedConnection && now - cachedAt < CONNECTION_TTL_MS) {
    return cachedConnection;
  }

  const {
    SF_LOGIN_URL,
    SF_USERNAME,
    SF_PASSWORD,
    SF_SECURITY_TOKEN,
  } = process.env;

  if (!SF_USERNAME || !SF_PASSWORD) {
    throw new Error(
      'Missing Salesforce credentials. Set SF_USERNAME and SF_PASSWORD (and SF_SECURITY_TOKEN if required) as environment variables.'
    );
  }

  const conn = new jsforce.Connection({
    loginUrl: SF_LOGIN_URL || 'https://login.salesforce.com',
  });

  const passwordWithToken = `${SF_PASSWORD}${SF_SECURITY_TOKEN || ''}`;

  await conn.login(SF_USERNAME, passwordWithToken);

  cachedConnection = conn;
  cachedAt = now;
  return conn;
}

module.exports = { getConnection };
