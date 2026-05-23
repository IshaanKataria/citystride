import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getArtifact, nearestNodeTo } from "./graph-loader.ts";
import { findThreeRoutes } from "./routing.ts";
import { composite } from "./scoring.ts";

const server = new McpServer({ name: "citystride", version: "0.1.0" });

// tool 1: plan_walk
server.tool(
  "plan_walk",
  "Plan a walk between two coordinates in Melbourne, returning up to 3 scored route options.",
  {
    from: z.tuple([z.number(), z.number()]).describe("Start [lng, lat]"),
    to: z.tuple([z.number(), z.number()]).describe("End [lng, lat]"),
    time: z.number().min(0).max(167).describe("Hour of week 0-167 (0=Mon midnight, 94=Friday 10pm)"),
  },
  async ({ from, to, time }) => {
    const fromNode = await nearestNodeTo(from[0], from[1]);
    const toNode = await nearestNodeTo(to[0], to[1]);
    const routes = await findThreeRoutes(fromNode.id, toNode.id, Math.floor(time));

    if (routes.length === 0) {
      return { content: [{ type: "text", text: "No routes found between those coordinates." }] };
    }

    const lines: string[] = [
      `## CityStride Walk Plan`,
      `Time slot: hour ${Math.floor(time)} of the week`,
      ``,
    ];

    for (const route of routes) {
      // top 3 unique street names by length contribution
      const streetLength = new Map<string, number>();
      for (const seg of route.segments) {
        streetLength.set(seg.street_name, (streetLength.get(seg.street_name) ?? 0) + seg.length_m);
      }
      const topStreets = [...streetLength.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name)
        .filter(Boolean)
        .join(", ");

      const km = (route.total_length_m / 1000).toFixed(2);
      const score = (route.avg_score * 100).toFixed(0);
      lines.push(`### Route ${route.id} — Score ${score}/100`);
      lines.push(`- Distance: ${km} km`);
      lines.push(`- Key streets: ${topStreets || "unknown"}`);
      lines.push(``);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// tool 2: describe_segment
server.tool(
  "describe_segment",
  "Describe the walkability of a Melbourne street by name, with metrics like lighting, pedestrian activity, canopy, and surface quality.",
  {
    address: z.string().describe('Street name, e.g. "Bourke Street"'),
    time: z.number().min(0).max(167).optional().describe("Hour of week 0-167 (default 94 = Friday 10pm)"),
  },
  async ({ address, time = 94 }) => {
    const artifact = await getArtifact();
    const h = Math.max(0, Math.min(167, Math.floor(time)));
    const needle = address.toLowerCase();

    // fuzzy match: prefer exact contains, then any word match
    const matches = artifact.edges.filter((e) =>
      e.street_name.toLowerCase().includes(needle)
    );

    if (matches.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No street found matching "${address}". Try a partial name like "Bourke" or "Swanston".`,
        }],
      };
    }

    // pick the highest-scoring edge as the representative sample
    const best = matches.reduce((a, b) => composite(a, h) >= composite(b, h) ? a : b);
    const score = composite(best, h);

    const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

    const lines = [
      `## ${best.street_name} — Streetscore`,
      ``,
      `**Overall score at hour ${h}:** ${(score * 100).toFixed(0)}/100`,
      ``,
      `| Metric | Value |`,
      `|---|---|`,
      `| Lighting (lux) | ${pct(best.lux)} |`,
      `| Gentle gradient | ${pct(best.gentle_gradient)} |`,
      `| Surface quality | ${pct(best.surface_quality)} |`,
      `| Tree canopy | ${pct(best.canopy)} |`,
      `| Bailout proximity | ${pct(best.bailout_proximity)} |`,
      `| Pedestrian activity | ${pct(best.ped_count[h])} |`,
      `| Open venues nearby | ${pct(best.open_venues[h])} |`,
      ``,
      `_Matched ${matches.length} segment(s) for "${address}". Showing highest-scoring sample._`,
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
