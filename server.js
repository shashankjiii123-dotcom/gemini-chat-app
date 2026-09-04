import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
app.use(express.static(__dirname));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

app.get('/', (req, res) => {
  const fileInPublic = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(fileInPublic)) {
    return res.sendFile(fileInPublic);
  }
  const fileInRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(fileInRoot)) {
    return res.sendFile(fileInRoot);
  }
  res.send('<h2>Server is running! Lekin index.html nahi mili.</h2>');
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // apiVersion स्पष्ट रूप से v1 सेट करने से 404 Not Found हल हो जाता है
    const model = genAI.getGenerativeModel(
      { model: 'gemini-1.5-flash' },
      { apiVersion: 'v1' }
    );
    
    const result = await model.generateContentStream(message);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Gemini Error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'API request failed' })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
