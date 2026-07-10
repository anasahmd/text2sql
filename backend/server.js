import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dbRoutes from './routes/db.js';
import chatRoutes from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/db', dbRoutes);
app.use('/api/chat', chatRoutes);

app.listen(PORT, () => {
  console.log(`✨ Text2SQL backend running on http://localhost:${PORT}`);
});
