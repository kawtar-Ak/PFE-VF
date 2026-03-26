const express = require("express");
const router = express.Router();
const { fetchBBCFootballNews } = require("./newsService");

router.get("/", async (req, res) => {
  try {
    const parsedLimit = Number(req.query?.limit);
    const news = await fetchBBCFootballNews(Number.isInteger(parsedLimit) ? parsedLimit : undefined);
    res.json({ news });
  } catch (error) {
    res.status(500).json({
      error: "Erreur recuperation news",
      message: error.message
    });
  }
});

module.exports = router;
