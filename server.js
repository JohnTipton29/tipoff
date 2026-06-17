const express = require('express');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const FEEDS = [
  { key: 'boardroom',  name: 'Boardroom',          url: 'https://boardroom.tv/feed/' },
  { key: 'espn',       name: 'ESPN',                url: 'https://www.espn.com/espn/rss/news' },
  { key: 'sportico',   name: 'Sportico',            url: 'https://www.sportico.com/feed/' },
  { key: 'fos',        name: 'Front Office Sports', url: 'https://frontofficesports.com/feed/' },
  { key: 'si',         name: 'Sports Illustrated',  url: 'https://www.si.com/rss/si_topstories.rss' },
  { key: 'on3',        name: 'On3',                 url: 'https://www.on3.com/feed/' },
  { key: 'cbssports',  name: 'CBS Sports',          url: 'https://www.cbssports.com/rss/headlines/' },
];

function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TipOff/1.0)' },
      timeout: 8000
    });
    const xml = await res.text();
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
    const channel = parsed.rss?.channel;
    if (!channel) return [];
    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    return items.slice(0, 10).map((item, i) => ({
      uid: feed.key + '-' + i,
      key: feed.key,
      name: feed.name,
      title: stripHtml(item.title || ''),
      snippet: stripHtml(item.description || '').slice(0, 200),
      link: item.link || '',
      pubDate: item.pubDate || ''
    }));
  } catch (e) {
    console.log('Failed to fetch ' + feed.name + ':', e.message);
    return [];
  }
}

app.get('/api/feeds', async (req, res) => {
  try {
    const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
    const articles = [];
    results.forEach(r => { if (r.status === 'fulfilled') articles.push(...r.value); });
    articles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    res.json({ success: true, articles });
  } catch (e) {
    res.json({ success: false, articles: [] });
  }
});

app.post('/api/analyze', async (req, res) => {
  const { title, snippet, type } = req.body;
  if (!title) return res.json({ success: false, error: 'No content provided' });

  const isBusiness = type === 'business';
  const prompt = isBusiness
    ? 'You are a business analyst. Analyze this article for someone building general business literacy. Return ONLY valid JSON, no markdown, no backticks. Format: {"summary":"2-3 sentence summary","keyFacts":["fact1","fact2","fact3"],"bigPicture":"1-2 sentences on broader significance"}\n\nArticle: "' + title + '. ' + (snippet || '') + '"'
    : 'You are a sports business analyst. Analyze this article for someone breaking into sports business (agencies, NIL, partnerships, operations). Return ONLY valid JSON, no markdown, no backticks. Format: {"summary":"2-3 sentence summary","keyFacts":["fact1","fact2","fact3"],"bigPicture":"1-2 sentences on why this matters in sports business"}\n\nArticle: "' + title + '. ' + (snippet || '') + '"';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    console.log('Anthropic response:', JSON.stringify(data).slice(0, 300));
    if (!data.content || !Array.isArray(data.content)) {
      throw new Error('Invalid API response: ' + JSON.stringify(data).slice(0, 200));
    }
    const raw = data.content.map(i => i.text || '').join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ success: true, analysis: parsed });
  } catch (e) {
    console.log('Analysis error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/analyze-paste', async (req, res) => {
  const { text, outlet } = req.body;
  if (!text) return res.json({ success: false, error: 'No text provided' });

  const prompt = 'You are a business and sports business analyst. Analyze this article. Return ONLY valid JSON, no markdown, no backticks. Format: {"title":"concise inferred article title","summary":"2-3 sentence summary","keyFacts":["fact1","fact2","fact3","fact4"],"bigPicture":"1-2 sentences on broader significance"}\n\nSource: ' + outlet + '\nText:\n' + text.slice(0, 3500);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-20240307',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    console.log('Anthropic paste response:', JSON.stringify(data).slice(0, 300));
    if (!data.content || !Array.isArray(data.content)) {
      throw new Error('Invalid API response: ' + JSON.stringify(data).slice(0, 200));
    }
    const raw = data.content.map(i => i.text || '').join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ success: true, analysis: parsed });
  } catch (e) {
    console.log('Paste analysis error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('TipOff running on port ' + PORT));
