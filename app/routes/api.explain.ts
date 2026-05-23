import Anthropic from "@anthropic-ai/sdk";

import type { Route } from "~/lib/types";

const EXPLANATION_TOOL = {
  name: "render_explanation",
  description: "Render a structured visual explanation of why a walking route is the best pick.",
  input_schema: {
    type: "object" as const,
    required: ["headline", "verdict", "highlights", "street_picks"],
    properties: {
      headline: {
        type: "string",
        description: "Punchy 3-5 word title for this route, e.g. 'The greener walk' or 'Bright and brisk'.",
      },
      verdict: {
        type: "string",
        description: "One vivid sentence (max 18 words) selling the route's vibe, e.g. 'A tree-lined cruise for your morning coffee run'.",
      },
      highlights: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        description: "Top 3-4 stats that make this route shine. Compare against the alternatives where possible.",
        items: {
          type: "object",
          required: ["icon", "label", "value", "compare"],
          properties: {
            icon: {
              type: "string",
              enum: ["tree", "lightbulb", "users", "ruler", "train", "footprints"],
              description: "tree=canopy, lightbulb=lighting, users=foot traffic, ruler=distance, train=transit, footprints=surface",
            },
            label: { type: "string", description: "Short label, e.g. 'Canopy', 'Lighting', 'Foot traffic'" },
            value: { type: "string", description: "The headline number with units, e.g. '84%', '24 lux', '1.2 km'" },
            compare: { type: "string", description: "How it stacks vs alternatives, e.g. '+32% vs others', 'matches route 2', 'best of the three'" },
          },
        },
      },
      street_picks: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        description: "1-3 specific streets on this route worth calling out, each with one concrete data point.",
        items: {
          type: "object",
          required: ["name", "detail"],
          properties: {
            name: { type: "string", description: "Street name, e.g. 'Flinders Lane'" },
            detail: { type: "string", description: "One specific number, e.g. '100% canopy, gentle slope'" },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You sell Melbourne walking routes to commuters. You'll receive 3 candidate routes with metrics; one is the recommended pick. Your job is to call the render_explanation tool with a structured pitch for the recommended route.

Rules:
- Compare quantitatively. When the recommended route beats the alternatives on a metric, say by how much in 'compare'.
- Positive framing only. Never use 'safe', 'avoid', or warn about other routes.
- Be specific: numbers > adjectives. '84% canopy' beats 'leafy'.
- Pick the 3-4 dimensions where the recommended route is most differentiated.
- Headline must be brand-y and 3-5 words.
- Verdict must read like a recommendation, not a description.`;

function summarizeRoute(route: Route, time: number, isRecommended: boolean) {
  const topEdges = route.edges.slice(0, 6).map((e) => ({
    street: e.name,
    length_m: Math.round(e.length_m),
    lux_pct: Math.round(e.metrics.lux * 100),
    ped_pct: Math.round(e.metrics.ped_vector[time] * 100),
    canopy_pct: Math.round(e.metrics.canopy * 100),
    surface_pct: Math.round(e.metrics.surface * 100),
    transit_pct: Math.round(e.metrics.transit * 100),
  }));

  const totalLen = Math.round(route.length_m);
  const avgScore = Math.round(route.score * 100);

  return {
    route_id: route.id,
    is_recommended: isRecommended,
    total_length_m: totalLen,
    avg_score_0_to_100: avgScore,
    top_segments: topEdges,
  };
}

export const action = async ({ request }: { request: Request }) => {
  try {
    const body = await request.json();
    const { route, allRoutes, time, destinationLabel } = body as {
      route: Route;
      allRoutes?: Route[];
      time: number;
      destinationLabel?: string;
    };

    const routesForPrompt = (allRoutes && allRoutes.length > 0 ? allRoutes : [route]).map((r) =>
      summarizeRoute(r, time, r.id === route.id),
    );

    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      tools: [EXPLANATION_TOOL],
      tool_choice: { type: "tool", name: "render_explanation" },
      messages: [
        {
          role: "user",
          content: `Time slot: hour ${time} of 168.
Recommended route id: ${route.id}.${destinationLabel ? `
Destination: ${destinationLabel}.` : ""}
All candidates:
${JSON.stringify(routesForPrompt, null, 2)}

Call the render_explanation tool now.`,
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("model did not call render_explanation");
    }

    return Response.json(toolBlock.input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
};
