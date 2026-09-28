const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/ids
// Returns the full lookup table of known product IDs, used by the scanner
// app as a fallback match when a scanned barcode doesn't correspond to a
// known lot number.
router.get('/ids', async (req, res) => {
  const idObject = process.env.SF_ID_OBJECT || 'cr5bd_productid__c';

  try {
    const conn = await getConnection();

    const soql = `
      SELECT Id, cr5bd_name__c, cr5bd_sku__c, cr5bd_productdescription__c, cr5bd_quantity__c
      FROM ${idObject}
    `;
    const result = await conn.query(soql);

    const ids = (result.records || []).map((r) => ({
      cr5bd_name: r.cr5bd_name__c,
      cr5bd_sku: r.cr5bd_sku__c,
      cr5bd_productdescription: r.cr5bd_productdescription__c,
      cr5bd_quantity: r.cr5bd_quantity__c,
    }));

    return res.json({ ids });
  } catch (err) {
    console.error('Error in GET /api/ids:', err);
    return res.status(500).json({ error: 'Internal server error fetching ids.' });
  }
});

module.exports = router;
