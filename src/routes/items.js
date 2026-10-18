const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/items?prefix=12345
//  OR  /api/items?accountNumber=12345   (legacy alias, still supported)
//
// Returns every Inventory_Product_line__c record whose
// Inventory_Product_Line_Id__c starts with the given prefix. The prefix is
// either a Recor account number (for inventory linked to an Account) or a
// contact's email address (for inventory linked directly to a Contact) —
// the caller resolves which one to use via /api/account or /api/contact
// first, then passes the resulting value here unchanged.
router.get('/items', async (req, res) => {
  const prefix = (req.query.prefix || req.query.accountNumber || '').toString().trim();

  if (!prefix) {
    return res.status(400).json({ error: 'Missing required query parameter: prefix' });
  }

  const itemObject = process.env.SF_ITEM_OBJECT || 'Inventory_Product_Line__c';
  const idField = process.env.SF_ITEM_ID_FIELD || 'Inventory_Product_Line_Id__c';
  const skuField = process.env.SF_ITEM_SKU_FIELD || 'Product_Part_Number__c';
  const lotSerialField = process.env.SF_ITEM_LOT_SERIAL_FIELD || 'Lot_Serial_Number__c';
  const expiryField = process.env.SF_ITEM_EXPIRY_FIELD || 'Expiry_Date__c';
  const quantityField = process.env.SF_ITEM_QUANTITY_FIELD || 'Quantity__c';

  try {
    const conn = await getConnection();

    const soql = `
      SELECT Id, ${idField}, ${skuField}, ${lotSerialField}, ${expiryField}, ${quantityField}
      FROM ${itemObject}
      WHERE ${idField} LIKE '${escapeSoqlLike(prefix)}%'
    `;
    const result = await conn.query(soql);

    const items = (result.records || []).map((r) => ({
      id: r.Id,
      lineId: r[idField],
      sku: r[skuField],
      lotSerial: r[lotSerialField],
      expiry: r[expiryField],
      quantity: r[quantityField],
    }));

    return res.json({ items });
  } catch (err) {
    console.error('Error in GET /api/items:', err);
    return res.status(500).json({ error: 'Internal server error fetching items.' });
  }
});

// Escapes characters that are special inside a SOQL string literal used in
// a LIKE clause (backslash, single quote, % and _) to reduce the risk of
// SOQL injection via the accountNumber query param.
function escapeSoqlLike(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

module.exports = router;