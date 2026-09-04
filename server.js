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

// Keys Pool: Render पर GEMINI_API_KEY और GEMINI_API_KEY_2 दोनों को सपोर्ट करेगा
function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY.trim());
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2.trim());
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3.trim());
  return keys;
}

let keyIndex = 0;

app.post('/api/chat', async (req, res) => {
  const { message, mode, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const keys = getApiKeys();
  if (keys.length === 0) {
    return res.status(500).json({ error: 'No GEMINI_API_KEY configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const systemInstruction = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;

  // लैटेंसी शून्य करने के लिए केवल पिछले 4 आवश्यक संदेश
  let cleanHistory = [];
  if (Array.isArray(history)) {
    cleanHistory = history
      .filter(item => item && item.text && !item.text.startsWith('Quota') && !item.text.startsWith('Server busy') && !item.text.startsWith('Error'))
      .slice(-4)
      .map(item => ({
        role: item.sender === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      }));
  }

  cleanHistory.push({
    role: 'user',
    parts: [{ text: message }]
  });

  let responded = false;
  let lastErrorMessage = '';

  // अगर 1 Key पर Quota खत्म हो, तो दूसरी Key पर ऑटो-स्विच
  for (let i = 0; i < keys.length; i++) {
    const currentApiKey = keys[(keyIndex + i) % keys.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${currentApiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: cleanHistory,
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.6
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        lastErrorMessage = errData.error?.message || response.statusText;
        // 429 Quota Exceeded आने पर तुरंत अगली Key ट्राई करो
        if (response.status === 429 || response.status === 503) {
          continue;
        }
        break;
      }

      // सफलता पर इंडेक्स आगे बढ़ाएं
      keyIndex = (keyIndex + i + 1) % keys.length;

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
      responded = true;
      break;
    } catch (err) {
      lastErrorMessage = err.message;
    }
  }

  if (!responded) {
    res.write(`data: ${JSON.stringify({ error: `Quota limit hit. Wait 15-20s or add a backup key (${lastErrorMessage})` })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`High-Speed Key-Rotating Orchestrator running on port ${port}`);
});
                
