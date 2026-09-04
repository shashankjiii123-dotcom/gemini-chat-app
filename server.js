import express from 'express';
import cors from 'cors';
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

app.get('/', (req, res) => {
  const fileInPublic = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(fileInPublic)) {
    return res.sendFile(fileInPublic);
  }
  const fileInRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(fileInRoot)) {
    return res.sendFile(fileInRoot);
  }
  res.send('<h2>Server running</h2>');
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // अगर मुख्य मॉडल बिजी (503) हो, तो यह बारी-बारी से अगले मॉडल्स पर स्विच करेगा
  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-1.5-pro'
  ];

  let success = false;
  let lastErrorMessage = '';

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message }] }]
        })
      });

      const data = await response.json();

      if (response.ok) {
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
        res.write(`data: ${JSON.stringify({ text: reply })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        success = true;
        break;
      } else {
        lastErrorMessage = data.error?.message || response.statusText;
        console.warn(`Model ${model} failed (${response.status}): ${lastErrorMessage}, trying next model...`);
      }
    } catch (err) {
      lastErrorMessage = err.message;
      console.warn(`Fetch to ${model} threw error: ${err.message}`);
    }
  }

  if (!success) {
    res.write(`data: ${JSON.stringify({ error: `Traffic high on Google servers: ${lastErrorMessage}. Please retry in a moment.` })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
