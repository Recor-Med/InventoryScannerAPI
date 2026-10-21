const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// POST /api/submit
// Body: { account, accountName, date, codes: [{ sku, lotSerial, expiry, quantity, count }] }
//
// Records the submitted stock count back into Salesforce. If
// SF_SUBMIT_FLOW_API_NAME is configured, the payload is forwarded to that
// Salesforce Flow (invoked as a REST-callable Flow) so all the business
// logic for what happens with a submission can live in Salesforce. If not
// configured, we fall back to just logging the payload so the endpoint
// still works end-to-end while the Flow is being built.
router.post('/submit', async (req, res) => {
  // TODO: Submit endpoint disabled until Salesforce Flow is configured
  return res.status(503).json({ error: 'Submit endpoint not yet configured. Please try again tomorrow.' });
});

module.exports = router;
