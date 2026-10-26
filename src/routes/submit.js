const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// POST /api/submit
// Body: {
//   recordType: 'account' | 'contact',
//   accountId: <Salesforce Account Id> | null,
//   contactId: <Salesforce Contact Id> | null,
//   codes: [{ sku, lotSerial, expiry, quantity, count }],
// }
//
// Creates one Inventory_Count__c parent record for this submission, then
// one Inventory_Count_Line__c child record per scanned table row,
// referencing the parent via its Id.
router.post('/submit', async (req, res) => {
  const { recordType, accountId, contactId, codes, date } = req.body || {};

  if (recordType !== 'account' && recordType !== 'contact') {
    return res.status(400).json({ error: "Missing or invalid 'recordType' (must be 'account' or 'contact')." });
  }
  if (recordType === 'account' && !accountId) {
    return res.status(400).json({ error: "Missing required field: accountId" });
  }
  if (recordType === 'contact' && !contactId) {
    return res.status(400).json({ error: "Missing required field: contactId" });
  }
  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Missing or empty required field: codes' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return res.status(400).json({ error: "Missing or invalid required field: date (expected YYYY-MM-DD)" });
  }

  const countObject = process.env.SF_COUNT_OBJECT || 'Inventory_Count__c';
  const countDateField = process.env.SF_COUNT_DATE_FIELD || 'Date__c';
  const countAccountField = process.env.SF_COUNT_ACCOUNT_FIELD || 'Account__c';
  const countContactField = process.env.SF_COUNT_CONTACT_FIELD || 'Contact__c';

  const lineObject = process.env.SF_COUNT_LINE_OBJECT || 'Inventory_Count_Line__c';
  const lineExpiryField = process.env.SF_COUNT_LINE_EXPIRY_FIELD || 'Expiry_Date__c';
  const lineCountField = process.env.SF_COUNT_LINE_COUNT_FIELD || 'Count__c';
  const lineQuantityField = process.env.SF_COUNT_LINE_QUANTITY_FIELD || 'Quantity__c';
  const lineLotSerialField = process.env.SF_COUNT_LINE_LOT_SERIAL_FIELD || 'Lot_Serial_Number__c';
  const lineSkuField = process.env.SF_COUNT_LINE_SKU_FIELD || 'Product_Sku__c';
  const lineParentField = process.env.SF_COUNT_LINE_PARENT_FIELD || 'Inventory_Count__c';

  // Use the date supplied by the client (computed from the user's own
  // local clock/timezone, not the server's) for both the parent record's
  // Name and Date__c - the server's timezone has no bearing on what
  // "today" means for whoever is actually using the scanner.
  const todayIso = date;

  try {
    const conn = await getConnection();

    const parentRecord = {
      Name: todayIso,
      [countDateField]: todayIso,
      [recordType === 'account' ? countAccountField : countContactField]:
        recordType === 'account' ? accountId : contactId,
    };

    const parentResult = await conn.sobject(countObject).create(parentRecord);
    if (!parentResult.success) {
      console.error('Error creating Inventory_Count__c:', JSON.stringify(parentResult.errors));
      return res.status(500).json({
        error: 'Failed to create Inventory_Count__c record.',
        details: parentResult.errors,
      });
    }

    const lineRecords = codes.map((code) => ({
      Name: code.sku || '',
      [lineExpiryField]: toSalesforceDate(code.expiry),
      [lineCountField]: Number(code.count) || 0,
      [lineQuantityField]: Number(code.quantity) || 0,
      [lineLotSerialField]: code.lotSerial || '',
      [lineSkuField]: code.sku || '',
      [lineParentField]: parentResult.id,
    }));

    const lineResults = await conn.sobject(lineObject).create(lineRecords);
    const lineResultsArray = Array.isArray(lineResults) ? lineResults : [lineResults];
    const failedLines = lineResultsArray
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => !result.success);

    if (failedLines.length > 0) {
      console.error('Error creating one or more Inventory_Count_Line__c records:', failedLines);
      return res.status(500).json({
        error: 'Inventory_Count__c record was created, but one or more Inventory_Count_Line__c records failed.',
        inventoryCountId: parentResult.id,
        failedLines,
      });
    }

    return res.json({
      success: true,
      inventoryCountId: parentResult.id,
      inventoryCountLineIds: lineResultsArray.map((result) => result.id),
    });
  } catch (err) {
    // jsforce throws on Salesforce-side failures (validation rules, bad Ids,
    // required-field errors, etc.) rather than always resolving with
    // success:false, so most real failures land here. Surface the actual
    // Salesforce error detail rather than a generic message, since this is
    // an internal tool and the detail is essential for diagnosing why a
    // submission failed (bad field API name, invalid Id, validation rule...).
    console.error('Error in POST /api/submit:', err);
    return res.status(500).json({
      error: 'Internal server error submitting inventory count.',
      message: err.message,
      errorCode: err.errorCode,
      fields: err.fields,
    });
  }
});

// Converts the app's displayed expiry date (MM/DD/YYYY, or a placeholder
// like "N/A"/"Unknown") into the YYYY-MM-DD format Salesforce Date fields
// expect. Returns null for anything unparseable so the field is simply
// left blank rather than rejected by Salesforce.
function toSalesforceDate(value) {
  if (!value) return null;

  const mdy = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const isoLike = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) {
    return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
  }

  return null;
}

module.exports = router;

