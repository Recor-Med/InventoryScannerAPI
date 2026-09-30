const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/verify-account?number=12345
// Simple existence check: does an Account with this Recor Account Number
// exist? Returns { found: true, id, name } or { found: false }. Useful for
// a quick end-to-end smoke test of the Salesforce connection without
// end-to-end smoke test of the Salesforce connection.
router.get('/verify-account', async (req, res) => {
  const accountNumber = (req.query.number || '').toString().trim();

  if (!accountNumber) {
    return res.status(400).json({ error: 'Missing required query parameter: number' });
  }

  const accountObject = process.env.SF_ACCOUNT_OBJECT || 'Account';
  const numberField = process.env.SF_ACCOUNT_NUMBER_FIELD || 'Recor_Account_Number__c';

  try {
    const conn = await getConnection();

    const soql = `SELECT Id, Name FROM ${accountObject} WHERE ${numberField} = '${escapeSoql(accountNumber)}' LIMIT 1`;
    const result = await conn.query(soql);

    if (!result.records || result.records.length === 0) {
      return res.json({ found: false });
    }

    const record = result.records[0];
    return res.json({ found: true, id: record.Id, name: record.Name });
  } catch (err) {
    console.error('Error in GET /api/verify-account:', err);
    return res.status(500).json({ error: 'Internal server error looking up account.', details: err.message });
  }
});

function escapeSoql(value) {
  return value.replace(/'/g, "\\'");
}

module.exports = router;
