const express = require("express");
const { fetchBBCFootballNews } = require("./newsService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const limitRaw = req.query?.limit;
    if (limitRaw !== undefined && !Number.isInteger(Number(limitRaw))) {
      return res.status(400).json({
        error: "Query param 'limit' must be an integer."
      });
    }

    const news = await fetchBBCFootballNews(limitRaw);

    return res.status(200).json({
      source: "BBC Sport",
      count: news.length,
      news
    });
  } catch (error) {
    return res.status(502).json({
      error: "Failed to fetch football news.",
      message: error.message
    });
  }
});

module.exports = router;
