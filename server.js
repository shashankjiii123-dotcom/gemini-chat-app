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

// कोर परमानेंट मेमोरी
const CORE_USER_CONTEXT = `
User Profile & Ground Truth:
- Name: Shashank Chaudhary (शशांक)
- Primary Aspirations: PCS/Civil Services exam preparation, full-stack application development & freelancing, and extreme personal discipline & routine.
- Rule: Always recognize Shashank as the master/creator of this OS. Never ask who he is or forget his name.
`;

const SYSTEM_PROMPTS = {
  general: `${CORE_USER_CONTEXT}\nRole: You are Shashank's Personal AI OS companion. You are sharp, proactive, and assist him across all daily tasks.`,
  pcs: `${CORE_USER_CONTEXT}\nRole: You are Shashank's elite PCS/Civil Services Mentor. Specialize in GS syllabus, static GK, answer writing frameworks, and exam strategy.`,
  freelance: `${CORE_USER_CONTEXT}\nRole: You are Shashank's senior freelance engineering partner. Assist in Flutter, Node.js, code architecture, and client deliverables.`,
  life: `${CORE_USER_CONTEXT}\nRole: You are Shashank's discipline coach. Monitor daily habits, morning physical routines, deep work study blocks, and mental clarity.`
};

app.get('/', (req, res) => {
  const fileInPublic = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(fileInPublic)) return res.sendFile(fileInPublic);
  const fileInRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(fileInRoot)) return res.sendFile(fileInRoot);
  res.send('<h2>App is running</h2>');
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      .filter(item => item && item.text && !item.text.startsWith('Server busy') && !item.text.startsWith('Memory/Orchestrator') && !item.text.startsWith('Google API Error'))
      .map(item => ({
        role: item.sender === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      }));
  }

  formattedContents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
  let success = false;
  let lastErrorMessage = '';

  // 3 रिट्राई अटेम्प्ट्स अगर गूगल सर्वर पर अचानक 503 लोड स्पाइक आए
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: formattedContents
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
        if (response.status === 503 || response.status === 429) {
          await sleep(1000 * attempt); // 1s, फिर 2s रुककर रिट्राई
          continue;
        }
        break;
      }
    } catch (err) {
      lastErrorMessage = err.message;
      await sleep(1000);
    }
  }

  if (!success) {
    res.write(`data: ${JSON.stringify({ error: `Server busy (${lastErrorMessage}). Please retry.` })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`AI Orchestrator running on port ${port}`);
});
