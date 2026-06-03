export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url 파라미터가 필요합니다" });

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `이미지 fetch 실패: ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    res.status(200).json({
      base64: `data:${contentType};base64,${base64}`,
      contentType
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
