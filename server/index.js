import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set in .env");
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Proxy endpoint for Anthropic messages API
app.post("/api/messages", async (req, res) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: { message: "Server proxy error: " + err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`API proxy server running on http://localhost:${PORT}`);
});
