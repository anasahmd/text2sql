import { Router } from 'express';
import dbManager from '../utils/dbManager.js';

const router = Router();

// POST /api/db/connect — Connect to a SQL database via URI
router.post('/connect', async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri) {
      return res.status(400).json({ error: 'Database URI is required.' });
    }

    const result = await dbManager.connect(uri);

    res.json({
      message: 'Connected successfully',
      type: result.type,
      tables: result.tables,
      schema: result.schema,
    });
  } catch (error) {
    console.error('DB Connection Error:', error);
    res.status(500).json({ error: error.message || 'Failed to connect to database' });
  }
});

// GET /api/db/status — Check connection status
router.get('/status', (_req, res) => {
  res.json({
    connected: dbManager.isConnected(),
    type: dbManager.getType(),
  });
});

// POST /api/db/disconnect — Tear down the active connection
router.post('/disconnect', async (_req, res) => {
  try {
    await dbManager.disconnect();
    res.json({ message: 'Disconnected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
