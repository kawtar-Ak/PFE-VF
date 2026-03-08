import { API_BASE_URL } from './apiConfig';

const API_URL = `${API_BASE_URL}/api/news`;

const stripHtml = (value = '') =>
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const truncate = (value = '', max = 170) => {
  const clean = String(value || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const normalizeArticle = (item = {}, index = 0) => ({
  id: `${item?.link || item?.title || 'news'}-${index}`,
  title: String(item?.title || '').trim() || 'Actualite football',
  description: truncate(stripHtml(item?.description || ''), 170),
  link: item?.link || null,
  pubDate: item?.pubDate || null,
  image: item?.image || null,
  source: item?.source || 'BBC Sport',
});

export const newsService = {
  getNews: async (limit = 20) => {
    const safeLimit = Number.isInteger(Number(limit)) ? Number(limit) : 20;
    const response = await fetch(`${API_URL}?limit=${safeLimit}`);

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.message) {
          message = payload.message;
        }
      } catch (error) {
        // ignore json parsing errors and keep HTTP message
      }
      throw new Error(message);
    }

    const payload = await response.json();
    const list = Array.isArray(payload?.news) ? payload.news : [];
    return list.map(normalizeArticle);
  },
};
