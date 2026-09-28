const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/account?number=12345
// Looks up a single Account in Salesforce by its account number and returns
// the fields the scanner app needs to confirm the account and drive the
// warehouse-scoped inventory lookup.
router.get('/account', async (req, res) => {
  const accountNumber = (req.query.number || '').toString().trim();

  if (!accountNumber) {
    return res.status(400).json({ error: 'Missing required query parameter: number' });
  }

  const accountObject = process.env.SF_ACCOUNT_OBJECT || 'Account';
  const numberField = process.env.SF_ACCOUNT_NUMBER_FIELD || 'AccountNumber';
  const warehouseField = process.env.SF_WAREHOUSE_CODE_FIELD || 'cr5bd_warehousecode__c';

  try {
    const conn = await getConnection();

    const soql = `SELECT Id, Name, ${warehouseField} FROM ${accountObject} WHERE ${numberField} = '${escapeSoql(accountNumber)}' LIMIT 1`;
    const result = await conn.query(soql);

    if (!result.records || result.records.length === 0) {
      return res.status(404).json({ error: `No account found for ${accountNumber}` });
    }

    const record = result.records[0];
    const name = record.Name;
    const warehouseCode = record[warehouseField];

    if (!name || !warehouseCode) {
      return res.status(422).json({
        error: 'Account found but missing required fields.',
        missing: {
          name: !name,
          warehouseCode: !warehouseCode,
        },
      });
    }

    return res.json({
      id: record.Id,
      name,
      warehouseCode,
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
