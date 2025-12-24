import express from "express";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();
const DATA_PATH = join(__dirname, "..", "data", "feedback.json");

router.post("/", (req, res) => {
  const { text, correctedEmotion, note } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" });
  }

  const item = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    text,
    correctedEmotion: correctedEmotion || null,
    note: note || null,
    createdAt: new Date().toISOString(),
  };

  try {
    let arr = [];
    if (existsSync(DATA_PATH)) {
      const raw = readFileSync(DATA_PATH, "utf8");
      arr = JSON.parse(raw || "[]");
    }
    arr.push(item);
    writeFileSync(DATA_PATH, JSON.stringify(arr, null, 2), "utf8");
    return res.json({ ok: true, item });
  } catch (err) {
    console.error("Failed to write feedback", err);
    return res.status(500).json({ error: "Failed to save feedback" });
  }
});

export default router;


// Stats endpoint: returns aggregate counts and recent entries
router.get("/stats", (req, res) => {
  try {
    let arr = [];
    if (existsSync(DATA_PATH)) {
      const raw = readFileSync(DATA_PATH, "utf8");
      arr = JSON.parse(raw || "[]");
    }
    const total = arr.length;
    const byEmotion = arr.reduce((acc, item) => {
      const k = item.correctedEmotion || "unspecified";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const recent = arr.slice(-10).reverse();
    return res.json({ total, byEmotion, recent });
  } catch (err) {
    console.error("Failed to read feedback stats", err);
    return res.status(500).json({ error: "Failed to read feedback" });
  }
});
