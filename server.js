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
You are talking to Shashank Chaudhary (शशांक).
Primary Goals: PCS Exam Preparation, Full-stack Dev/Freelancing, Daily Habits & Discipline.
Always be extremely fast, direct, concise, and to-the-point. Avoid robotic fillers.
`;

const SYSTEM_PROMPTS = {
  general: `${CORE_USER_CONTEXT}\nRole: Ultra-fast Personal AI OS. Reply instantly with sharp clarity.`,
  pcs: `${CORE_USER_CONTEXT}\nRole: Elite PCS Mentor. Deliver high-yield factual and analytical points directly.`,
  freelance: `${CORE_USER_CONTEXT}\nRole: Senior Full-Stack Architect. Production-ready, crisp code and solutions.`,
  life: `${CORE_USER_CONTEXT}\nRole: High-performance Life Coach. Direct, actionable habit tracking and routine advice.`
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
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const systemInstruction = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;

  // लैटेंसी कम करने के लिए केवल हाल के 6 सबसे ताज़ा मैसेजेस भेजें (Sliding Context Window)
  let cleanHistory = [];
  if (Array.isArray(history)) {
    cleanHistory = history
      .filter(item => item && item.text && !item.text.startsWith('Server busy') && !item.text.startsWith('Error'))
      .slice(-6)
      .map(item => ({
        role: item.sender === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      }));
  }

  cleanHistory.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: cleanHistory,
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.6
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ error: errData.error?.message || response.statusText })}\n\n`);
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
      buffer = lines.pop() || '';

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
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`High-Speed Pipeline running on port ${port}`);
});
