const axios = require('axios');
const NodeCache = require('node-cache');

const feedCache = new NodeCache({ stdTTL: 15 * 60, checkperiod: 120 });
const GOOGLE_NEWS = 'https://news.google.com/rss/search?q=';
const TOPICS = {
    'industrial-automation': {
        label: 'Industrial automation',
        query: '"industrial automation" OR PLC OR SCADA OR robotics',
    },
    'information-technology': {
        label: 'IT & digital technology',
        query: 'cloud computing OR cybersecurity OR software technology India',
    },
    'digital-marketing': {
        label: 'Digital marketing',
        query: 'digital marketing OR SEO OR performance marketing India',
    },
    'bms-cctv': {
        label: 'BMS & CCTV',
        query: '"building management system" OR BMS OR CCTV OR access control',
    },
    'embedded-iot': {
        label: 'Embedded systems & IoT',
        query: '"embedded systems" OR IoT OR firmware OR microcontrollers',
    },
    companies: {
        label: 'Companies & workplaces',
        query: 'technology companies India hiring careers workplace company news company policy hiring policy',
    },
    careers: {
        label: 'Careers & preparation',
        query: 'job interview preparation resume salary workplace careers India',
    },
    government: {
        label: 'Government & employment policy',
        query: 'employment labour jobs rules India site:pib.gov.in OR site:labour.gov.in',
        officialFeed: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1',
    },
};

const decodeXml = (value) => String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, code) => {
        const number = code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    })
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'").replace(/&amp;/gi, '&');

const textOnly = (value, limit) => decodeXml(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);

const tagValue = (entry, tagName) => {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = entry.match(new RegExp(`<(?:(?:[\\w.-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escaped}\\s*>`, 'i'));
    return match?.[1] || '';
};

const parseLink = (entry) => {
    const element = entry.match(/<(?:(?:[\w.-]+):)?link\b([^>]*)>([\s\S]*?)<\/(?:(?:[\w.-]+):)?link\s*>/i);
    if (element?.[2]?.trim()) return textOnly(element[2], 1500);
    const selfClosing = entry.match(/<(?:(?:[\w.-]+):)?link\b([^>]*)\/?\s*>/i);
    const href = selfClosing?.[1]?.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    return decodeXml(href || '');
};

const parseSource = (entry) => {
    const sourceTag = entry.match(/<(?:(?:[\w.-]+):)?source\b([^>]*)>([\s\S]*?)<\/(?:(?:[\w.-]+):)?source\s*>/i);
    return textOnly(sourceTag?.[2] || '', 100);
};

const parseFeed = (xml, topicKey, topicLabel) => {
    const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
    return entries.map(([, , entry]) => {
        const title = textOnly(tagValue(entry, 'title'), 220);
        const summary = textOnly(tagValue(entry, 'description') || tagValue(entry, 'summary') || tagValue(entry, 'content'), 520);
        const rawLink = parseLink(entry);
        let url = '';
        try {
            const candidate = new URL(rawLink);
            if (candidate.protocol === 'https:' || candidate.protocol === 'http:') url = candidate.toString();
        } catch { /* Ignore malformed publisher links. */ }
        if (!title || !url) return null;
        const published = textOnly(tagValue(entry, 'pubDate') || tagValue(entry, 'published') || tagValue(entry, 'updated'), 100);
        const date = Number.isNaN(Date.parse(published)) ? null : new Date(published).toISOString();
        let publisher = parseSource(entry);
        if (!publisher) {
            try { publisher = new URL(url).hostname.replace(/^www\./, ''); } catch { publisher = 'Publisher'; }
        }
        return {
            id: `${topicKey}-${Buffer.from(url).toString('base64url').slice(0, 28)}`,
            topic: topicKey,
            topicLabel,
            title,
            summary: summary || 'Open this story in the portal to read its headline and publisher details.',
            publisher,
            publishedAt: date,
            url,
        };
    }).filter(Boolean);
};

const fetchFeed = async (url, topicKey, topicLabel) => {
    const response = await axios.get(url, {
        timeout: 9000,
        maxContentLength: 1_000_000,
        maxBodyLength: 1_000_000,
        responseType: 'text',
        headers: { 'User-Agent': 'IPCS-Student-Portal/1.0 (Career Hub feed reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    return parseFeed(String(response.data || ''), topicKey, topicLabel);
};

const loadTopic = async (key, refresh = false) => {
    const cached = feedCache.get(key);
    if (cached && !refresh) return cached;
    const topic = TOPICS[key];
    const urls = [
        `${GOOGLE_NEWS}${encodeURIComponent(topic.query)}&hl=en-IN&gl=IN&ceid=IN:en`,
        ...(topic.officialFeed ? [topic.officialFeed] : []),
    ];
    const settled = await Promise.allSettled(urls.map((url) => fetchFeed(url, key, topic.label)));
    const articles = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const distinct = [...new Map(articles.map((article) => [article.url, article])).values()]
        .sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0))
        .slice(0, 24);
    const result = { articles: distinct, lastUpdated: new Date().toISOString() };
    feedCache.set(key, result);
    return result;
};

const getCareerHubFeed = async (req, res) => {
    const requestedTopic = String(req.query.topic || 'all');
    const keys = requestedTopic === 'all' ? Object.keys(TOPICS) : [requestedTopic];
    if (keys.some((key) => !TOPICS[key])) {
        return res.status(400).json({ success: false, message: 'Choose one of the available Career Hub topics.' });
    }

    try {
        const refresh = req.query.refresh === '1';
        const results = await Promise.all(keys.map((key) => loadTopic(key, refresh)));
        const articles = results.flatMap((result) => result.articles)
            .sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0))
            .slice(0, 80);
        const lastUpdated = results.reduce((latest, result) => result.lastUpdated > latest ? result.lastUpdated : latest, '');
        return res.status(200).json({
            success: true,
            topic: requestedTopic,
            topics: Object.entries(TOPICS).map(([id, value]) => ({ id, label: value.label })),
            articles,
            lastUpdated,
            cacheMinutes: 15,
            policySource: 'Government policy headlines include the official Press Information Bureau feed.',
        });
    } catch (error) {
        console.error('Career Hub feed error:', error.message);
        return res.status(502).json({ success: false, message: 'Career Hub feeds are temporarily unavailable. Please try again shortly.' });
    }
};

module.exports = { getCareerHubFeed };
