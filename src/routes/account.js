const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/account?number=12345
//  OR  /api/account?id=001XXXXXXXXXXXXXXX
//
// Checks whether an Account exists in Salesforce, identified either by its
// Recor Account Number (custom field) or directly by Salesforce record Id
// (used when the scanner link is launched from the Account page, which
// supplies the Account's record Id in the URL rather than the account
// number itself). Either way, the response includes `accountNumber` so the
// front end knows what value to use as the prefix when filtering
// Inventory_Product_Line__c records via /api/items.
router.get('/account', async (req, res) => {
  const accountNumber = (req.query.number || '').toString().trim();
  const accountId = (req.query.id || '').toString().trim();

  if (!accountNumber && !accountId) {
    return res.status(400).json({ error: 'Missing required query parameter: number or id' });
  }

  const accountObject = process.env.SF_ACCOUNT_OBJECT || 'Account';
  const numberField = process.env.SF_ACCOUNT_NUMBER_FIELD || 'Recor_Account_Number__c';

  try {
    const conn = await getConnection();

    const soql = accountId
      ? `SELECT Id, Name, ${numberField} FROM ${accountObject} WHERE Id = '${escapeSoql(accountId)}' LIMIT 1`
      : `SELECT Id, Name, ${numberField} FROM ${accountObject} WHERE ${numberField} = '${escapeSoql(accountNumber)}' LIMIT 1`;
    const result = await conn.query(soql);

    if (!result.records || result.records.length === 0) {
      return res.status(404).json({
        found: false,
        error: `No account found for ${accountId ? `id ${accountId}` : accountNumber}`,
      });
    }

    const record = result.records[0];
    const resolvedAccountNumber = record[numberField];

    if (!resolvedAccountNumber) {
      return res.status(422).json({
        found: true,
        error: `Account ${record.Id} is missing ${numberField}.`,
      });
    }

    return res.json({
      found: true,
      id: record.Id,
      name: record.Name,
      accountNumber: resolvedAccountNumber,
    });
  } catch (err) {
    console.error('Error in GET /api/account:', err);
    return res.status(500).json({ error: 'Internal server error looking up account.' });

  }
});

// Very small helper to reduce the risk of SOQL injection from the query param.
function escapeSoql(value) {
  return value.replace(/'/g, "\\'");
}

module.exports = router;

