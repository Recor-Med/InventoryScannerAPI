const express = require('express');
const { getConnection } = require('../sfClient');

const router = express.Router();

// POST /api/submit
// Body: { account, accountName, date, codes: [{ sku, description, lot, expiry, quantity, count }] }
//
// Records the submitted stock count back into Salesforce. If
// SF_SUBMIT_FLOW_API_NAME is configured, the payload is forwarded to that
// Salesforce Flow (invoked as a REST-callable Flow) so all the business
// logic for what happens with a submission can live in Salesforce. If not
// configured, we fall back to just logging the payload so the endpoint
// still works end-to-end while the Flow is being built.
router.post('/submit', async (req, res) => {
  const payload = req.body;

  if (!payload || !payload.account || !Array.isArray(payload.codes) || payload.codes.length === 0) {
    return res.status(400).json({ error: 'Invalid submission payload.' });
  }

  const flowApiName = process.env.SF_SUBMIT_FLOW_API_NAME;

  try {
    if (flowApiName) {
      const conn = await getConnection();
      const result = await conn.requestPost(
        `/services/data/v${conn.version || '59.0'}/actions/custom/flow/${flowApiName}`,
        {
          inputs: [
            {
              account: payload.account,
              accountName: payload.accountName,
              date: payload.date,
              codesJson: JSON.stringify(payload.codes),
            },
          ],
        }
      );
      return res.json({ success: true, flowResult: result });
    }

    // No Flow configured yet — accept and log so the frontend flow can be tested.
    console.log('Received submission (no SF_SUBMIT_FLOW_API_NAME configured):', JSON.stringify(payload, null, 2));
    return res.json({ success: true, note: 'Logged only — SF_SUBMIT_FLOW_API_NAME not configured.' });
  } catch (err) {
    console.error('Error in POST /api/submit:', err);
    return res.status(500).json({ error: 'Internal server error submitting data.' });
  }
});

module.exports = router;
