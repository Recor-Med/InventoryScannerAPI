require('dotenv').config();

const express = require('express');
const cors = require('cors');

const accountRoutes = require('./src/routes/account');
const itemsRoutes = require('./src/routes/items');
const idsRoutes = require('./src/routes/ids');
const submitRoutes = require('./src/routes/submit');

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
