import Anthropic from "@anthropic-ai/sdk";

import type { Route } from "~/lib/types";

export const action = async ({ request }: { request: Request }) => {
  const body = await request.json();
  const { route, time } = body as { route: Route; time: number };

  const client = new Anthropic();

  const systemPrompt = `You are a walking route advisor for Melbourne, Australia. You explain why a specific walking route was recommended by the CityStride app.

Rules:
- Use positive framing only. Describe what makes the route good, never what makes alternatives bad.
- Reference specific numbers from the route data (scores, distances, metrics).
- Acknowledge any data limitations (e.g., estimated pedestrian counts).
- Keep the explanation to 4-6 paragraphs, ~250 words max.
- Use descriptive language like "well-lit," "lively," "tree-lined" — never "safe" or "avoid."
- Do not mention crime, danger, or safety concerns.`;

  const edgeSummaries = route.edges.slice(0, 10).map((e) => ({
    street: e.street_name,
    length: e.length_m,
    lux: (e.metrics.lux * 100).toFixed(0),
    traffic: (e.metrics.ped_count[time] * 100).toFixed(0),
    canopy: (e.metrics.canopy * 100).toFixed(0),
    surface: (e.metrics.surface_quality * 100).toFixed(0),
    transit: (e.metrics.bailout_proximity * 100).toFixed(0),
  }));

  const userPrompt = `Explain why Route ${route.id} (score: ${(route.score * 100).toFixed(0)}/100, length: ${route.length_m}m) is recommended.

Key segments:
${JSON.stringify(edgeSummaries, null, 2)}`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
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
