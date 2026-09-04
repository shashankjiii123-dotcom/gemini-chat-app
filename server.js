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

const CORE_USER_CONTEXT = `
User Profile:
- Name: Shashank Chaudhary (शशांक)
- Core Pillars: PCS preparation, full-stack dev/freelance, life discipline.
- Rule: You know Shashank directly. Be instant, concise, crisp, and conversational.
`;

const SYSTEM_PROMPTS = {
  general: `${CORE_USER_CONTEXT}\nRole: High-speed Personal AI OS. Respond quickly and helpfully.`,
  pcs: `${CORE_USER_CONTEXT}\nRole: Elite PCS Mentor. Deliver sharp, factual, syllabus-oriented answers.`,
  freelance: `${CORE_USER_CONTEXT}\nRole: Full-stack engineer & freelance architect. Crisp code and direct fixes.`,
  life: `${CORE_USER_CONTEXT}\nRole: High-performance life & habit coach. Direct, actionable guidance.`
};

app.get('/', (req, res) => {
  const fileInPublic = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(fileInPublic)) return res.sendFile(fileInPublic);
  const fileInRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(fileInRoot)) return res.sendFile(fileInRoot);
  res.send('<h2>App is running</h2>');
});

app.post('/api/chat', async (req, res) => {
  const { message, mode, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemInstruction = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;

  let formattedContents = [];
  if (Array.isArray(history)) {
    formattedContents = history
      .filter(item => item && item.text && !item.text.startsWith('Server busy') && !item.text.startsWith('Error'))
      .map(item => ({
        role: item.sender === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      }));
  }

  formattedContents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  try {
    // SSE Real-time Streaming Endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: formattedContents
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ error: err.error?.message || response.statusText })}\n\n`);
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // बचा हुआ अधूरा टुकड़ा

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText) {
              res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: `Connection issue: ${err.message}` })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Live Ultra-Fast Streaming Orchestrator running on port ${port}`);
});
