const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// GET /api/contact?id=003XXXXXXXXXXXXXXX
//  OR  /api/contact?email=name@example.com
//
// Looks up a Contact in Salesforce either by record Id (used when the
// scanner link is launched from the Contact page) or by email address
// (used when a user manually types an email into the scanner's account
// entry form). Returns the Contact's email address, which the front end
// uses as the prefix when filtering Inventory_Product_Line__c records via
// /api/items (instead of an account number, for inventory lines linked
// directly to a Contact rather than an Account).
router.get('/contact', async (req, res) => {
  const contactId = (req.query.id || '').toString().trim();
  const email = (req.query.email || '').toString().trim();

  if (!contactId && !email) {
    return res.status(400).json({ error: 'Missing required query parameter: id or email' });
  }

  try {
    const conn = await getConnection();

    const soql = contactId
      ? `SELECT Id, Email FROM Contact WHERE Id = '${escapeSoql(contactId)}' LIMIT 1`
      : `SELECT Id, Email FROM Contact WHERE Email = '${escapeSoql(email)}' LIMIT 1`;
    const result = await conn.query(soql);

    if (!result.records || result.records.length === 0) {
      return res.status(404).json({
        found: false,
        error: `No contact found for ${contactId ? `id ${contactId}` : email}`,
      });
    }

    const record = result.records[0];

    if (!record.Email) {
      return res.status(422).json({
        found: true,
        error: `Contact ${record.Id} is missing an email address.`,
      });
    }

    return res.json({
      found: true,
      id: record.Id,
      email: record.Email,
    });
  } catch (err) {
    console.error('Error in GET /api/contact:', err);
    return res.status(500).json({ error: 'Internal server error looking up contact.' });
  }
});

// Very small helper to reduce the risk of SOQL injection from the query param.
function escapeSoql(value) {
  return value.replace(/'/g, "\\'");
}

module.exports = router;
