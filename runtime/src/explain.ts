import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import type { Route, RouteSegment } from "../../shared/types.ts";
import { getEdgeById } from "./graph-loader.ts";
import { composite } from "./scoring.ts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are CityStride, a pedestrian route guide for Melbourne.
Write a plain-English explanation of a walking route in exactly 4 paragraphs (~250 words total).
Rules:
- Positive framing only. Never use "avoid", "dangerous", "bad", or negative language. Always say "this offers" or "you'll find".
- Reference specific numbers from the data: lux values, pedestrian counts, canopy coverage, gradient scores.
- Each paragraph covers one theme: (1) overall character and score, (2) lighting and safety feel, (3) foot traffic and vibrancy, (4) greenery, gradient, and walkability comfort.
- No markdown, no bullet points, no headers. Pure flowing prose paragraphs separated by blank lines.
- Keep it under 280 words total. Be vivid but concise.`;

type SegmentDetail = {
  street_name: string;
  composite_score: number;
  lux: number;
  ped_count: number;
  canopy: number;
  steepness: number;
  length_m: number;
};

async function buildUserMessage(route: Route, time: number): Promise<string> {
  const hour = Math.max(0, Math.min(167, Math.floor(time)));

  const segmentDetails: SegmentDetail[] = [];
  for (const seg of route.segments.slice(0, 5)) {
    const edge = await getEdgeById(seg.edge_id);
    if (!edge) {
      segmentDetails.push({
        street_name: seg.street_name,
        composite_score: seg.score_at_time,
        lux: 0,
        ped_count: 0,
        canopy: 0,
        steepness: 0,
        length_m: seg.length_m,
      });
      continue;
    }
    segmentDetails.push({
      street_name: edge.street_name || seg.street_name,
      composite_score: composite(edge, hour),
      lux: edge.lux,
      ped_count: edge.ped_count[hour],
      canopy: edge.canopy,
      steepness: 1 - edge.gentle_gradient,
      length_m: seg.length_m,
    });
  }

  const segsText = segmentDetails
    .map(
      (s, i) =>
        `  Segment ${i + 1}: ${s.street_name} — ${s.length_m}m, score ${(s.composite_score * 100).toFixed(0)}/100, ` +
        `lux ${(s.lux * 100).toFixed(0)}, pedestrians ${(s.ped_count * 100).toFixed(0)}/hr, ` +
        `canopy ${(s.canopy * 100).toFixed(0)}%, steepness ${(s.steepness * 100).toFixed(0)}%`
    )
    .join("\n");

  const timeLabel = `${String(Math.floor(time / 7)).padStart(2, "0")}:${String((time % 7) * 10).padStart(2, "0")}`;

  return `Route overview:
- Total length: ${(route.total_length_m / 1000).toFixed(2)} km
- Average score: ${(route.avg_score * 100).toFixed(0)}/100
- Time of day: ${timeLabel} (hour-slot ${time}/167)
- Segments (top ${segmentDetails.length}):
${segsText}

Write the 4-paragraph explanation now.`;
}

export async function streamExplanation(route: Route, time: number, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const userMessage = await buildUserMessage(route, time);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
}
