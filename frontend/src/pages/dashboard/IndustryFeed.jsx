import { useEffect, useMemo, useState } from 'react';
import api from '../../config/axios';

const DEFAULT_TOPICS = [
  { id: 'all', label: 'For you' },
  { id: 'industrial-automation', label: 'Industrial automation' },
  { id: 'information-technology', label: 'IT & digital tech' },
  { id: 'digital-marketing', label: 'Digital marketing' },
  { id: 'bms-cctv', label: 'BMS & CCTV' },
  { id: 'embedded-iot', label: 'Embedded & IoT' },
  { id: 'companies', label: 'Companies & workplaces' },
  { id: 'careers', label: 'Career preparation' },
  { id: 'government', label: 'Government & policy' },
];

const formatDate = (date) => {
  if (!date) return 'Recent update';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Recent update';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(parsed);
};

export default function IndustryFeed() {
  const [topic, setTopic] = useState('all');
  const [topics, setTopics] = useState(DEFAULT_TOPICS);
  const [articles, setArticles] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [query, setQuery] = useState('');
  const [savedArticles, setSavedArticles] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem('talenzo_career_hub_saved') || '[]'); return Array.isArray(value) ? value.filter((article) => article && typeof article.id === 'string') : []; } catch { return []; }
  });
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestKey = `${topic}:${refreshing}`;
  const loading = loadedRequestKey !== requestKey;
  const savedIds = useMemo(() => savedArticles.map((article) => article.id), [savedArticles]);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/api/career-hub', { params: { topic: topic === 'saved' ? 'all' : topic, refresh: refreshing ? '1' : undefined }, signal: controller.signal })
      .then(({ data }) => {
        if (!data.success) throw new Error(data.message || 'Could not load the Career Hub feed.');
        setError('');
        setArticles(Array.isArray(data.articles) ? data.articles : []);
        setLastUpdated(data.lastUpdated || '');
        if (Array.isArray(data.topics)) setTopics([{ id: 'all', label: 'For you' }, ...data.topics]);
      })
      .catch((requestError) => {
        if (requestError.code === 'ERR_CANCELED') return;
        setError(requestError.response?.data?.message || requestError.message || 'Career Hub could not load right now.');
        setArticles([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedRequestKey(requestKey); });
    return () => controller.abort();
  }, [topic, refreshing, requestKey]);

  useEffect(() => {
    if (!selectedArticle) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelectedArticle(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedArticle]);

  const visibleArticles = useMemo(() => {
    const sourceArticles = topic === 'saved' ? savedArticles : articles;
    const filtered = sourceArticles.filter((article) => {
      const text = `${article.title} ${article.summary} ${article.publisher} ${article.topicLabel}`.toLowerCase();
      const matchesQuery = !query.trim() || text.includes(query.trim().toLowerCase());
      return matchesQuery;
    });
    return filtered;
  }, [articles, query, savedArticles, topic]);

  const selectTopic = (value) => {
    if (value === 'saved') {
      setTopic('saved');
      return;
    }
    setTopic(value);
  };

  const refreshFeed = () => {
    setRefreshing((value) => !value);
  };

  const toggleSaved = (article) => {
    setSavedArticles((current) => {
      const next = current.some((saved) => saved.id === article.id)
        ? current.filter((saved) => saved.id !== article.id)
        : [article, ...current].slice(0, 80);
      try { localStorage.setItem('talenzo_career_hub_saved', JSON.stringify(next)); } catch { /* Keep the current list available for this visit. */ }
      return next;
    });
  };

  return (
    <main className="career-hub-page animate-fade-in">
      <section className="career-hub-hero">
        <div className="career-hub-hero-copy">
          <p className="eyebrow">IPCS Career Intelligence</p>
          <h1>Your industries.<br /><span>Your next move.</span></h1>
          <p>Follow the fields you’re studying, see what companies are discussing, and prepare for the work ahead.</p>
          <div className="career-hub-topic-summary"><i className="ph-fill ph-sparkle"></i><span>Automation · IT · Marketing · BMS & CCTV · Embedded & IoT · Careers</span></div>
        </div>
        <div className="career-hub-hero-art" aria-hidden="true">
          <div className="career-hub-orbit career-hub-orbit-one"><i className="ph-fill ph-cpu"></i></div>
          <div className="career-hub-orbit career-hub-orbit-two"><i className="ph-fill ph-briefcase"></i></div>
          <div className="career-hub-core"><i className="ph-fill ph-newspaper-clipping"></i></div>
        </div>
      </section>

      <div className="career-hub-feed-heading">
        <div><p className="eyebrow">A live reading list</p><h2>Industry & career feed</h2><p>Company news, workplace trends, interview advice, salary and resume guidance.</p></div>
        <div className="career-hub-updated"><i className="ph ph-clock-counter-clockwise"></i><span>{lastUpdated ? `Updated ${formatDate(lastUpdated)}` : 'Updates throughout the day'}</span></div>
      </div>

      <div className="career-hub-controls">
        <div className="career-hub-topic-tabs" role="tablist" aria-label="Career Hub topics">
          {topics.map((item) => (
            <button type="button" role="tab" aria-selected={topic === item.id} className={topic === item.id ? 'active' : ''} key={item.id} onClick={() => selectTopic(item.id)}>{item.label}</button>
          ))}
          <button type="button" role="tab" aria-selected={topic === 'saved'} className={topic === 'saved' ? 'active' : ''} onClick={() => selectTopic('saved')}><i className="ph-fill ph-bookmark-simple"></i> Saved <span>{savedIds.length}</span></button>
        </div>
        <div className="career-hub-search-row">
          <label className="career-hub-search"><i className="ph ph-magnifying-glass"></i><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics, companies, or advice" aria-label="Search the feed" /></label>
          <button type="button" className="career-hub-refresh" onClick={refreshFeed} disabled={loading} aria-label="Refresh stories"><i className={`ph ph-arrows-clockwise ${loading ? 'career-hub-spinning' : ''}`}></i><span>Refresh</span></button>
        </div>
      </div>

      <div className="career-hub-feed-status" aria-live="polite">
        <span><i className="ph-fill ph-broadcast"></i> {topic === 'saved' ? 'Your saved reading list' : topic === 'all' ? 'Stories selected for IPCS students' : topics.find((item) => item.id === topic)?.label}</span>
        <span>{loading ? 'Loading stories…' : `${visibleArticles.length} ${visibleArticles.length === 1 ? 'story' : 'stories'}`}</span>
      </div>

      {!loading && error && <div className="career-hub-message error" role="alert"><i className="ph ph-warning-circle"></i><span>{error}</span><button type="button" onClick={refreshFeed}>Try again</button></div>}
      {loading && <div className="career-hub-skeletons" aria-label="Loading stories">{Array.from({ length: 6 }, (_, index) => <div className="career-hub-skeleton" key={index}><i></i><b></b><span></span><span></span></div>)}</div>}
      {!loading && !error && topic === 'saved' && !savedIds.length && <div className="career-hub-empty"><i className="ph ph-bookmark-simple"></i><h3>Your reading list is ready</h3><p>Save stories to keep interview tips, industry news, and career guides close at hand.</p><button type="button" onClick={() => selectTopic('all')}>Browse the feed</button></div>}
      {!loading && !error && topic !== 'saved' && !articles.length && <div className="career-hub-empty"><i className="ph ph-rss-simple"></i><h3>No new stories came through</h3><p>Feeds can pause briefly. Try refreshing in a little while.</p><button type="button" onClick={refreshFeed}>Refresh stories</button></div>}
      {!loading && !error && articles.length > 0 && visibleArticles.length === 0 && <div className="career-hub-empty"><i className="ph ph-magnifying-glass"></i><h3>No matches</h3><p>Try another search or choose a different topic.</p><button type="button" onClick={() => { setQuery(''); selectTopic('all'); }}>Show all topics</button></div>}

      {!loading && visibleArticles.length > 0 && (
        <section className="career-hub-card-grid" aria-label="Industry and career stories">
          {visibleArticles.map((article, index) => {
            const saved = savedIds.includes(article.id);
            return (
              <article className={`career-hub-story ${index === 0 && topic !== 'saved' ? 'featured' : ''}`} key={article.id}>
                <div className="career-hub-story-top"><span><i className="ph-fill ph-tag"></i>{article.topicLabel}</span><button type="button" className={saved ? 'saved' : ''} aria-label={saved ? 'Remove saved story' : 'Save story'} aria-pressed={saved} onClick={() => toggleSaved(article)}><i className={`ph-${saved ? 'fill' : 'regular'} ph-bookmark-simple`}></i></button></div>
                <button type="button" className="career-hub-story-open" onClick={() => setSelectedArticle(article)}>
                  <h3>{article.title}</h3>
                  <p>{article.summary}</p>
                </button>
                <footer><span className="career-hub-publisher"><i className="ph ph-globe-hemisphere-west"></i>{article.publisher}</span><time dateTime={article.publishedAt || undefined}>{formatDate(article.publishedAt)}</time></footer>
                <button type="button" className="career-hub-read-action" onClick={() => setSelectedArticle(article)}>Read in Career Hub <i className="ph ph-arrow-up-right"></i></button>
              </article>
            );
          })}
        </section>
      )}

      <p className="career-hub-note"><i className="ph ph-info"></i> Headlines and summaries stay in the portal. Government and employment policy items include official PIB updates; confirm any rule with the original government notice before acting.</p>

      {selectedArticle && (
        <div className="career-hub-reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedArticle(null); }}>
          <section className="career-hub-reader" role="dialog" aria-modal="true" aria-labelledby="career-hub-reader-title">
            <button type="button" className="career-hub-reader-close" onClick={() => setSelectedArticle(null)} aria-label="Close story"><i className="ph ph-x"></i></button>
            <p className="eyebrow">{selectedArticle.topicLabel}</p>
            <h2 id="career-hub-reader-title">{selectedArticle.title}</h2>
            <div className="career-hub-reader-meta"><span><i className="ph ph-globe-hemisphere-west"></i>{selectedArticle.publisher}</span><time>{formatDate(selectedArticle.publishedAt)}</time></div>
            <p className="career-hub-reader-summary">{selectedArticle.summary}</p>
            <div className="career-hub-reader-footer"><span>Publisher: {selectedArticle.publisher}</span><div><button type="button" className={savedIds.includes(selectedArticle.id) ? 'saved' : ''} onClick={() => toggleSaved(selectedArticle)}><i className={`ph-${savedIds.includes(selectedArticle.id) ? 'fill' : 'regular'} ph-bookmark-simple`}></i>{savedIds.includes(selectedArticle.id) ? 'Saved' : 'Save for later'}</button><a href={selectedArticle.url} target="_blank" rel="noreferrer" referrerPolicy="no-referrer">Read full story <i className="ph ph-arrow-square-out"></i></a></div></div>
          </section>
        </div>
      )}
    </main>
  );
}
