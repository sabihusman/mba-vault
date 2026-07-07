// Gemini wrappers for /ask: embed the question (same model + dims as the index,
// or cosine breaks) and stream the answer. Both sit behind small interfaces so the
// RAG orchestration in answer.ts is testable with fakes; the real calls need
// GEMINI_API_KEY and are exercised in prod.
import { GoogleGenAI } from "@google/genai";

// Query embeddings MUST use the same model/dims the index was built with.
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 1536;

// Answer model — flash-lite tier per the architecture doc. Confirmed against the
// live model list (2026-07): the stable alias resolves to 3.1-flash-lite-05-2026.
export const ANSWER_MODEL = "gemini-3.1-flash-lite";

export interface QueryEmbedder {
  /** Embed a question → raw (un-normalized) vector; search.ts normalizes it. */
  embedQuery(question: string): Promise<Float32Array>;
}

export interface AnswerGenerator {
  /** Stream the answer text, chunk by chunk. */
  generate(systemInstruction: string, prompt: string): AsyncGenerator<string>;
}

export type GeminiClient = QueryEmbedder & AnswerGenerator;

export function createGeminiClient(apiKey: string): GeminiClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async embedQuery(question: string): Promise<Float32Array> {
      const response = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: question,
        config: { outputDimensionality: EMBED_DIMS },
      });
      const values = response.embeddings?.[0]?.values ?? [];
      if (values.length !== EMBED_DIMS) {
        throw new Error(`query embedding has ${values.length} dims, expected ${EMBED_DIMS}`);
      }
      return new Float32Array(values);
    },

    async *generate(systemInstruction: string, prompt: string): AsyncGenerator<string> {
      const stream = await ai.models.generateContentStream({
        model: ANSWER_MODEL,
        contents: prompt,
        config: { systemInstruction },
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    },
  };
}
