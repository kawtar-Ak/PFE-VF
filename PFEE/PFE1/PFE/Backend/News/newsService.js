const Parser = require("rss-parser");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchImpl }) => fetchImpl(...args));

const BBC_RSS_URL = "http://newsrss.bbc.co.uk/rss/sportonline_uk_edition/football/rss.xml";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parser = new Parser({
  customFields: {
    item: [
      "media:thumbnail",
      "media:content",
      "content:encoded"
    ]
  }
});

const decodeHtml = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const stripHtml = (value = "") =>
  decodeHtml(String(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value = "", max = 220) => {
  const clean = String(value || "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const extractImageFromHtml = (html = "") => {
  const match = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
};

const extractImage = (item = {}) => {
  if (item?.enclosure?.url) return item.enclosure.url;

  const thumbnail = item?.["media:thumbnail"];
  if (thumbnail?.$?.url) return thumbnail.$.url;
  if (thumbnail?.url) return thumbnail.url;

  const mediaContent = item?.["media:content"];
  if (Array.isArray(mediaContent) && mediaContent[0]?.$?.url) return mediaContent[0].$.url;
  if (mediaContent?.$?.url) return mediaContent.$.url;
  if (Array.isArray(mediaContent) && mediaContent[0]?.url) return mediaContent[0].url;
  if (mediaContent?.url) return mediaContent.url;

  const contentEncoded = item?.["content:encoded"];
  const encodedImage = extractImageFromHtml(contentEncoded);
  if (encodedImage) return encodedImage;

  return extractImageFromHtml(item?.description || "");
};

const normalizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(parsed, MAX_LIMIT));
};

const mapArticle = (item = {}) => {
  const pubDate = parseDate(item?.pubDate || item?.isoDate);
  const descriptionRaw = item?.contentSnippet || item?.content || item?.description || "";

  return {
    title: stripHtml(item?.title || ""),
    description: truncate(stripHtml(descriptionRaw), 260),
    link: item?.link || null,
    pubDate: pubDate ? pubDate.toISOString() : null,
    image: extractImage(item),
    source: "BBC Sport"
  };
};

const fetchBBCFootballNews = async (limitInput = DEFAULT_LIMIT) => {
  const limit = normalizeLimit(limitInput);

  try {
    const response = await fetch(BBC_RSS_URL, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`BBC RSS request failed with status ${response.status}`);
    }

    const xml = await response.text();
    const feed = await parser.parseString(xml);
    const items = Array.isArray(feed?.items) ? feed.items : [];

    return items
      .map(mapArticle)
      .filter((article) => article.title && article.link)
      .sort((left, right) => {
        const leftTime = left.pubDate ? new Date(left.pubDate).getTime() : 0;
        const rightTime = right.pubDate ? new Date(right.pubDate).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, limit);
  } catch (error) {
    console.error("[news] RSS fetch error:", error.message);
    throw new Error("Unable to fetch football news from BBC RSS.");
  }
};

module.exports = {
  BBC_RSS_URL,
  fetchBBCFootballNews
};
