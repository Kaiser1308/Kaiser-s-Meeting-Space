import cors from "@fastify/cors";
import Fastify from "fastify";
import { createAiProvider } from "@kms/ai";
import type { GenerateMinutesInput } from "@kms/domain";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const provider = createAiProvider({
  provider: process.env.AI_PROVIDER === "openai-compatible" ? "openai-compatible" : "mock",
  apiKey: process.env.AI_API_KEY,
  baseUrl: process.env.AI_BASE_URL,
  model: process.env.AI_MODEL,
});

app.get("/health", async () => ({ ok: true, ai: await provider.healthcheck() }));

app.post<{ Body: GenerateMinutesInput }>("/v1/minutes/generate", async (request, reply) => {
  if (!request.body.transcript.length) return reply.code(400).send({ error: "Transcript is required" });
  const ordered = [...request.body.transcript].sort((a, b) => a.sequence - b.sequence);
  return provider.generateDetailedMinutes({ ...request.body, transcript: ordered, detailLevel: request.body.detailLevel ?? "detailed" });
});

const port = Number(process.env.API_PORT ?? 4310);
await app.listen({ port, host: "127.0.0.1" });
