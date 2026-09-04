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

// Knowledge Profiles for Modes
const SYSTEM_PROMPTS = {
  general: "You are a helpful, brilliant, and proactive Personal AI assistant.",
  pcs: "You are an elite PCS/Civil Services Mentor. You specialize in syllabus tracking, GS papers, state-specific static GK, answer-writing frameworks, and strict factual precision. Guide step-by-step.",
  freelance: "You are a senior full-stack software engineer and freelance architect. Focus on clean code, production architecture, Node.js, Flutter, APIs, debugging, and client deliverable standards.",
  life: "You are a high-performance life coach and discipline strategist. You focus on daily routines, active recall, physical fitness, deep work blocks, and extreme mental clarity. Give direct, actionable feedback."
};

app.get('/', (req, res) => {
  const fileInPublic = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(fileInPublic)) return res.sendFile(fileInPublic);
  const fileInRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(fileInRoot)) return res.sendFile(fileInRoot);
  res.send('<h2>App is running</h2>');
});

app.post('/api/chat', async (req, res) => {
  const { message, mode } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemInstruction = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;
  const candidateModels = ['gemini-3.6-flash', 'gemini-2.5-flash'];
  let success = false;
  let lastErrorMessage = '';

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
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
      }
    } catch (err) {
      lastErrorMessage = err.message;
    }
  }

  if (!success) {
    res.write(`data: ${JSON.stringify({ error: `Orchestrator error: ${lastErrorMessage}` })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`AI Orchestrator running on port ${port}`);
});
