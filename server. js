const express = require('express');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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
    console.log(`Failed to fetch ${feed.name}:`, e.message);
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`TipOff running on port ${PORT}`));
