/**
 * A stand-in for the Anthropic Messages API, covering the one call this CRM
 * makes: POST /v1/messages. It checks the request looks like a real one
 * (correct headers, a system prompt, a user message) and returns a
 * deterministic reply built from what was asked, so a test can assert on it
 * without paying for or depending on a live model.
 */
import http from "node:http";

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.url !== "/v1/messages")
      return send(404, { type: "error", error: { message: "not found" } });

    if (req.headers["x-api-key"] !== (process.env.ANTHROPIC_STUB_KEY || "stub-anthropic-key"))
      return send(
        401,
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
      );
    if (req.headers["anthropic-version"] !== "2023-06-01")
      return send(400, { type: "error", error: { message: "missing anthropic-version" } });

    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(400, { type: "error", error: { message: "invalid JSON" } });
    }
    if (!body.system || !Array.isArray(body.messages) || !body.messages[0]?.content)
      return send(400, { type: "error", error: { message: "malformed request" } });

    const userText = String(body.messages[0].content);
    // A deliberately malformed instruction, so the audit can prove an upstream
    // rejection is reported rather than silently swallowed.
    if (/TRIGGER_UPSTREAM_ERROR/.test(userText))
      return send(529, { type: "error", error: { message: "stub overloaded" } });

    // Echoes back what it was given so a test can assert the context actually
    // reached the model -- the case number, and nothing that should have been
    // withheld from it.
    return send(200, {
      id: "msg_stub",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [
        { type: "text", text: `STUB REPLY for: ${userText.slice(0, 500)}` },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  });
});

const port = Number(process.env.ANTHROPIC_STUB_PORT || 8098);
server.listen(port, "127.0.0.1", () =>
  console.log(`anthropic stub on http://127.0.0.1:${port}`),
);
