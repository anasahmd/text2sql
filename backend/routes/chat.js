import { Router } from 'express';
import dbManager from '../utils/dbManager.js';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { SqlDatabase } from '@langchain/classic/sql_db';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const router = Router();

/**
 * Factory to create the LLM instance based on the LLM_PROVIDER env var.
 */
const createLLM = () => {
  const provider = process.env.LLM_PROVIDER || 'openai';

  switch (provider.toLowerCase()) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key') {
        throw new Error('OPENAI_API_KEY is missing or invalid in .env');
      }
      return new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0,
        apiKey: process.env.OPENAI_API_KEY,
      });

    case 'gemini':
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key') {
        throw new Error('GEMINI_API_KEY is missing or invalid in .env');
      }
      return new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        temperature: 0,
        apiKey: process.env.GEMINI_API_KEY,
      });

    case 'groq':
      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key') {
        throw new Error('GROQ_API_KEY is missing or invalid in .env');
      }
      return new ChatGroq({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        apiKey: process.env.GROQ_API_KEY,
      });

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
};

// ──────────────────────────────────────────
// Read-only SQL validation
// ──────────────────────────────────────────

const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'REPLACE', 'MERGE', 'UPSERT', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE',
  'CALL', 'SET ', 'LOCK', 'UNLOCK', 'RENAME', 'VACUUM', 'REINDEX',
  'ATTACH', 'DETACH', 'PRAGMA',
];

/**
 * Validate that a SQL query is read-only (SELECT/WITH/EXPLAIN only).
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateReadOnly(sql) {
  const normalized = sql
    .replace(/--.*$/gm, '')        // strip single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim()
    .toUpperCase();

  // Must start with SELECT, WITH, or EXPLAIN
  if (!/^(SELECT|WITH|EXPLAIN)\b/.test(normalized)) {
    return { valid: false, reason: 'Query must start with SELECT, WITH, or EXPLAIN.' };
  }

  // Check for forbidden keywords (word-boundary match to avoid false positives)
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword.trim()}\\b`, 'i');
    if (pattern.test(normalized)) {
      return { valid: false, reason: `Forbidden keyword detected: ${keyword.trim()}. Only read-only queries are allowed.` };
    }
  }

  // Check for multiple statements (semicolon-separated injection)
  const withoutStrings = normalized.replace(/'[^']*'/g, '');
  const statements = withoutStrings.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    return { valid: false, reason: 'Multiple SQL statements are not allowed.' };
  }

  return { valid: true };
}

// ──────────────────────────────────────────
// POST /api/chat/generate — Generate SQL (no execution)
// ──────────────────────────────────────────
router.post('/generate', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (!dbManager.isConnected()) {
      return res.status(400).json({ error: 'No database connected.' });
    }

    const llm = createLLM();
    const dataSource = dbManager.getDataSource();
    const db = await SqlDatabase.fromDataSourceParams({ appDataSource: dataSource });
    const tableInfo = await db.getTableInfo();

    const dbType = dbManager.getType();
    const dialect = dbType === 'postgres' ? 'PostgreSQL' : dbType === 'mysql' ? 'MySQL' : 'SQLite';

    const sqlGenResponse = await llm.invoke([
      new SystemMessage(
        `You are a SQL expert. Given the following database schema and the user's question, write a READ-ONLY SQL query to answer the question.

Database Schema:
${tableInfo}

Rules:
- Output ONLY the raw SQL query, no markdown, no explanations, no backticks.
- Use standard SQL compatible with ${dialect}.
- For counting, always use COUNT(*).
- Do NOT add LIMIT unless the user asks for a specific number of results.
- Make sure column names and table names exactly match the schema.
- NEVER generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any data-modifying statements.
- Only generate SELECT queries (or WITH/CTE + SELECT).`
      ),
      new HumanMessage(message),
    ]);

    const sql = sqlGenResponse.content.trim().replace(/^```sql\n?/i, '').replace(/\n?```$/i, '').trim();
    console.log('Generated SQL:', sql);

    // Pre-validate before sending to frontend
    const validation = validateReadOnly(sql);

    res.json({ sql, validation });
  } catch (error) {
    console.error('Generate Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate SQL.' });
  }
});

// ──────────────────────────────────────────
// POST /api/chat/execute — Validate & execute SQL, then summarize
// ──────────────────────────────────────────
router.post('/execute', async (req, res) => {
  try {
    const { sql, message } = req.body;
    if (!sql) {
      return res.status(400).json({ error: 'SQL query is required.' });
    }

    if (!dbManager.isConnected()) {
      return res.status(400).json({ error: 'No database connected.' });
    }

    // Enforce read-only
    const validation = validateReadOnly(sql);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.reason });
    }

    const llm = createLLM();
    const dataSource = dbManager.getDataSource();
    const db = await SqlDatabase.fromDataSourceParams({ appDataSource: dataSource });

    console.log('Executing SQL:', sql);
    const queryResult = await db.run(sql);

    // Summarize results
    const answer = await summarize(llm, message || 'User query', sql, queryResult);

    res.json({ answer, sql });
  } catch (error) {
    console.error('Execute Error:', error);
    res.status(500).json({ error: error.message || 'Failed to execute query.' });
  }
});

// ──────────────────────────────────────────
// POST /api/chat/validate — Validate SQL only (no execution)
// ──────────────────────────────────────────
router.post('/validate', (req, res) => {
  const { sql } = req.body;
  if (!sql) {
    return res.status(400).json({ error: 'SQL query is required.' });
  }

  const validation = validateReadOnly(sql);
  res.json(validation);
});

/**
 * Ask the LLM to summarize SQL results in natural language.
 */
async function summarize(llm, question, sql, queryResult) {
  const truncatedResult = queryResult.length > 4000
    ? queryResult.substring(0, 4000) + '\n...(truncated)'
    : queryResult;

  const summaryResponse = await llm.invoke([
    new SystemMessage(
      `You are a helpful data analyst. The user asked a question about their database and a SQL query was executed. Summarize the results clearly in natural language.

Rules:
- Include relevant numbers and key data points.
- Format nicely with markdown (tables, bold, lists) when appropriate.
- Be concise but thorough.
- If the result is empty, say so clearly.`
    ),
    new HumanMessage(
      `User question: ${question}\n\nSQL query executed:\n${sql}\n\nQuery result:\n${truncatedResult}`
    ),
  ]);

  return summaryResponse.content;
}

export default router;
