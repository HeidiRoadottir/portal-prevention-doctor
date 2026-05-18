const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "0.0.0.0";
const chatModel = process.env.PORTAL_OPENAI_MODEL || "gpt-4.1-mini";
let runtimeApiKey = process.env.PORTAL_OPENAI_API_KEY || "";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ino": "text/plain; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    if (req.url === "/api/key" && req.method === "POST") {
      try {
        const body = await readJson(req);
        runtimeApiKey = String(body.apiKey || "").trim();
        sendJson(res, { ok: !!runtimeApiKey });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message || String(error) }, 400);
      }
      return;
    }

    if (req.url === "/api/chat" && req.method === "POST") {
      try {
        if (!runtimeApiKey) {
          sendJson(res, { ok: false, error: "Missing local API key. Paste it in the app and press Gem." }, 400);
          return;
        }

        const body = await readJson(req);
        const prompt = String(body.prompt || "").trim();
        if (!prompt) {
          sendJson(res, { ok: false, error: "Missing prompt." }, 400);
          return;
        }

        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeApiKey}`,
          },
          body: JSON.stringify({
            model: chatModel,
            input: prompt,
            max_output_tokens: 240,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data?.error?.message || `OpenAI HTTP ${response.status}`;
          sendJson(res, { ok: false, error: message }, response.status);
          return;
        }

        sendJson(res, { ok: true, text: extractText(data), raw: data });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message || String(error) }, 500);
      }
      return;
    }

    if (req.url === "/api/speech" && req.method === "POST") {
      try {
        if (!runtimeApiKey) {
          sendJson(res, { ok: false, error: "Missing local API key. Paste it in the app and press Gem." }, 400);
          return;
        }

        const body = await readJson(req);
        const text = String(body.text || "").trim();
        if (!text) {
          sendJson(res, { ok: false, error: "Missing text." }, 400);
          return;
        }

        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            input: text,
            response_format: "mp3",
            instructions:
              "Speak Danish clearly with a calm, clinical, neutral voice. Use short, controlled pacing. Sound like an automated medical system: dry and precise, but still easy to understand. Do not sound warm, theatrical, playful, or overly emotional.",
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data?.error?.message || `OpenAI speech HTTP ${response.status}`;
          sendJson(res, { ok: false, error: message }, response.status);
          return;
        }

        const audio = Buffer.from(await response.arrayBuffer());
        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        });
        res.end(audio);
      } catch (error) {
        sendJson(res, { ok: false, error: error.message || String(error) }, 500);
      }
      return;
    }

    if (req.url === "/api/transcribe" && req.method === "POST") {
      try {
        if (!runtimeApiKey) {
          sendJson(res, { ok: false, error: "Missing local API key. Paste it in the app and press Gem." }, 400);
          return;
        }

        const audio = await readRaw(req, 12 * 1024 * 1024);
        if (!audio.length) {
          sendJson(res, { ok: false, error: "Missing audio." }, 400);
          return;
        }

        const contentType = String(req.headers["content-type"] || "audio/webm");
        const form = new FormData();
        form.append("model", process.env.PORTAL_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
        form.append("language", "da");
        form.append(
          "prompt",
          "Transskriber dansk tale fra en Raspberry Pi-installation. Brug dansk stavning. Emnet er prævention, kondom, graviditet, kønssygdomme, hormoner, spiral, p-piller og konsultation. Returner kun det brugeren siger."
        );
        form.append("file", new Blob([audio], { type: contentType }), "speech.webm");

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${runtimeApiKey}`,
          },
          body: form,
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data?.error?.message || `OpenAI transcription HTTP ${response.status}`;
          sendJson(res, { ok: false, error: message }, response.status);
          return;
        }

        sendJson(res, { ok: true, text: String(data.text || "").trim(), raw: data });
      } catch (error) {
        sendJson(res, { ok: false, error: error.message || String(error) }, 500);
      }
      return;
    }

    let urlPath = decodeURIComponent(String(req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    urlPath = path.normalize(urlPath).replace(/^[/\\]+/, "");

    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      res.end(data);
    });
  })
  .listen(port, host, () => {
    console.log(`Doktor Portal server: http://localhost:${port}/portal-prevention-doctor/`);
  });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function extractText(data) {
  if (data.output_text) return String(data.output_text).trim();
  const chunks = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (part.text) chunks.push(part.text);
    }
  }
  return chunks.join(" ").trim();
}
