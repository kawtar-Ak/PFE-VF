const Parser = require('rss-parser');
const parser = new Parser();

const BBC_RSS = "https://feeds.bbci.co.uk/sport/football/rss.xml";

async function fetchBBCFootballNews(limit) {
  const feed = await parser.parseURL(BBC_RSS);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : feed.items.length;

  return feed.items.slice(0, safeLimit).map((item) => ({
    title: item.title,
    description: item.contentSnippet || item.content || item.summary || "",
    link: item.link,
    pubDate: item.pubDate,
    source: "BBC Sport"
  }));
}

module.exports = {
  fetchBBCFootballNews,
  getFootballNews: fetchBBCFootballNews
};
