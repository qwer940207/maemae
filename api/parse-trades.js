import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "이미지가 없습니다" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `이 이미지는 한국 증권사의 매매 내역 화면입니다.
아래 정보를 JSON으로 추출해주세요:

1. date: 조회 시작일 (YYYY-MM-DD 형식, 일자 필드 기준)
2. trades: 매매 내역 배열, 각 항목은:
   - name: 종목명
   - profit: 실현손익 (숫자, 원 단위, 손실은 음수)
   - returnRate: 수익률 (숫자, % 단위, 손실은 음수)

반드시 아래 형식으로만 응답하세요 (다른 텍스트 없이):
{"date":"2026-05-06","trades":[{"name":"종목명","profit":1000000,"returnRate":9.86}]}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType || "image/png", data: imageBase64 } },
          { type: "text", text: prompt }
        ]
      }]
    });

    const text = response.content[0].text.trim();
    const json = JSON.parse(text);
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: "분석 실패: " + e.message });
  }
}
