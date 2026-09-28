const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/items?warehouseCode=ABC
// Returns the consignment inventory items for a given warehouse.
router.get('/items', async (req, res) => {
  const warehouseCode = (req.query.warehouseCode || '').toString().trim();

  if (!warehouseCode) {
    return res.status(400).json({ error: 'Missing required query parameter: warehouseCode' });
  }

  const itemObject = process.env.SF_ITEM_OBJECT || 'cr5bd_inventoryitem__c';
  const warehouseField = process.env.SF_ITEM_WAREHOUSE_FIELD || 'cr5bd_warehousecode__c';

  try {
    const conn = await getConnection();

    const soql = `
      SELECT Id, cr5bd_sku__c, cr5bd_description__c, cr5bd_lotnumber__c,
             cr5bd_expirydate__c, cr5bd_quantity__c
      FROM ${itemObject}
      WHERE ${warehouseField} = '${escapeSoql(warehouseCode)}'
    `;
    const result = await conn.query(soql);

    const items = (result.records || []).map((r) => ({
      cr5bd_sku: r.cr5bd_sku__c,
      cr5bd_description: r.cr5bd_description__c,
      cr5bd_lotnumber: r.cr5bd_lotnumber__c,
      cr5bd_expirydate: r.cr5bd_expirydate__c,
      cr5bd_quantity: r.cr5bd_quantity__c,
    }));

    return res.json({ items });
  } catch (err) {
    console.error('Error in GET /api/items:', err);
    return res.status(500).json({ error: 'Internal server error fetching items.' });
  }
});

function escapeSoql(value) {
  return value.replace(/'/g, "\\'");
}

module.exports = router;
