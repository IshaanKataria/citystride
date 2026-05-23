import Anthropic from "@anthropic-ai/sdk";

import type { Route } from "~/lib/types";

export const action = async ({ request }: { request: Request }) => {
  const body = await request.json();
  const { route, time } = body as { route: Route; time: number };

  const client = new Anthropic();

  const systemPrompt = `You are a walking route advisor for Melbourne. Explain a recommended walking route in 2 short paragraphs, around 80 words total.

Rules:
- Open with the headline: distance, score, and the one most striking quality (canopy, lighting, foot traffic, or transit).
- Second paragraph: name one or two specific streets and tie a real number to each ("Flinders Lane has 100% canopy").
- Positive framing only. Never use "safe", "avoid", or warn about alternatives.
- No "Note:" footnotes. No bullet points. No headings. Just two tight paragraphs.`;

  const edgeSummaries = route.edges.slice(0, 5).map((e) => ({
    street: e.name,
    length_m: Math.round(e.length_m),
    lux: Math.round(e.metrics.lux * 100),
    traffic: Math.round(e.metrics.ped_vector[time] * 100),
    canopy: Math.round(e.metrics.canopy * 100),
    surface: Math.round(e.metrics.surface * 100),
    transit: Math.round(e.metrics.transit * 100),
  }));

  const userPrompt = `Route ${route.id}: score ${(route.score * 100).toFixed(0)}/100, length ${Math.round(route.length_m)}m.

Top segments:
${JSON.stringify(edgeSummaries, null, 2)}

Write the 2-paragraph explanation.`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
};
