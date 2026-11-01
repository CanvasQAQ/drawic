import { z } from "zod";

const id = z.string().min(1).max(120);
const point = z.number().int().min(-100000).max(100000).multipleOf(10);
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const endpoint = z.object({ deviceId: id, pinId: id }).strict();
export const readFields = { offset: z.number().int().min(0).optional(), symbolId: id.optional() };
export const editFields = {
  sessionId: id, expectedRevision: z.number().int().nonnegative(), requestId: id, pageId: id,
  operations: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("place"), id, symbolId: id, x: point, y: point,
      rotation: rotation.optional(), mirrored: z.boolean().optional(), mirroredVertically: z.boolean().optional() }).strict(),
    z.object({ type: z.literal("transform"), id, x: point.optional(), y: point.optional(),
      rotation: rotation.optional(), mirrored: z.boolean().optional(), mirroredVertically: z.boolean().optional() }).strict(),
    z.object({ type: z.literal("connect"), id, start: endpoint, end: endpoint }).strict(),
  ])).min(1).max(32),
};
export const agentRequest = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("read_page"), ...readFields }).strict(),
  z.object({ tool: z.literal("edit_page"), ...editFields }).strict(),
]);
export type AgentRequest = z.infer<typeof agentRequest>;
