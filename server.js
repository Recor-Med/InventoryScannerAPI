require('dotenv').config();

const express = require('express');
const cors = require('cors');

const accountRoutes = require('./src/routes/account');
const itemsRoutes = require('./src/routes/items');
const idsRoutes = require('./src/routes/ids');
const submitRoutes = require('./src/routes/submit');
const { getConnection } = require('./src/sfClient');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Recor Scanner API' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// TEMPORARY diagnostic route - lists exact object API names containing "Inventory"
// as seen by the Salesforce API itself. Remove once the object name mismatch is resolved.
app.get('/api/_debug/objects', async (req, res) => {
  try {
    const conn = await getConnection();
    const describe = await conn.describeGlobal();
    const matches = describe.sobjects
      .filter((o) => o.name.toLowerCase().includes('inventory'))
      .map((o) => ({ name: o.name, label: o.label, custom: o.custom, queryable: o.queryable }));
    const customObjects = describe.sobjects
      .filter((o) => o.custom)
      .map((o) => ({ name: o.name, label: o.label, queryable: o.queryable }));
    res.json({
      inventoryMatchCount: matches.length,
      inventoryMatches: matches,
      totalObjectsVisible: describe.sobjects.length,
      customObjectCount: customObjects.length,
      customObjects,
    });
  } catch (err) {
    console.error('Error in /api/_debug/objects:', err);
    res.status(500).json({ error: err.message });
  }
});

// TEMPORARY: directly describe the specific object to surface the real
// underlying reason it's inaccessible (licensing vs. permission vs. typo).
app.get('/api/_debug/describe-item-object', async (req, res) => {
  try {
    const conn = await getConnection();
    const whoAmI = await conn.identity();
    let describeResult = null;
    let describeError = null;
    try {
      describeResult = await conn.sobject('Inventory_Product_Line__c').describe();
    } catch (e) {
      describeError = { message: e.message, errorCode: e.errorCode, name: e.name };
    }
    res.json({
      runningAsUserId: whoAmI.user_id,
      runningAsUsername: whoAmI.username,
      profileUrl: whoAmI.profile,
      describeError,
      describeResult: describeResult
        ? {
            name: describeResult.name,
            label: describeResult.label,
            queryable: describeResult.queryable,
            accessible: describeResult.accessible,
            createable: describeResult.createable,
            custom: describeResult.custom,
          }
        : null,
    });
  } catch (err) {
    console.error('Error in /api/_debug/describe-item-object:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', accountRoutes);
app.use('/api', itemsRoutes);
app.use('/api', idsRoutes);
app.use('/api', submitRoutes);

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Recor Scanner API listening on port ${port}`);
});
