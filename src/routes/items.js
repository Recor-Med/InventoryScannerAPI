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

// GET /api/items/by-lot-serial?lotSerial=12345
//
// Looks up Inventory_Product_line__c records by an exact match on
// Lot_Serial_Number__c, regardless of account/contact prefix. Used when a
// scanned barcode's lot/serial number isn't found in the inventory already
// loaded for the current account, so we can still surface the Product
// Part Number (PRDS) for display.
router.get('/items/by-lot-serial', async (req, res) => {
  const lotSerial = (req.query.lotSerial || '').toString().trim();

  if (!lotSerial) {
    return res.status(400).json({ error: 'Missing required query parameter: lotSerial' });
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
      WHERE ${lotSerialField} = '${escapeSoqlString(lotSerial)}'
      LIMIT 1
    `;
    const result = await conn.query(soql);

    const record = (result.records || [])[0];
    const item = record
      ? {
          id: record.Id,
          lineId: record[idField],
          sku: record[skuField],
          lotSerial: record[lotSerialField],
          expiry: record[expiryField],
          quantity: record[quantityField],
        }
      : null;

    return res.json({ item });
  } catch (err) {
    console.error('Error in GET /api/items/by-lot-serial:', err);
    return res.status(500).json({ error: 'Internal server error fetching item by lot/serial.' });
  }
});

// Escapes characters that are special inside a string literal used in a
// SOQL `=` comparison (backslash and single quote) to reduce the risk of
// SOQL injection via the lotSerial query param.
function escapeSoqlString(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

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