// Gemini wrapper for the one-time concept bootstrap step. This call only reads
// the user's own coursework excerpts (already in the prompt) — no web search
// tool, no grounding — so it carries the same "no tools" hardening as /ask
// (SECURITY.md §7). Structured JSON output (responseSchema) is used instead of
// free-text parsing so a malformed model reply fails loudly rather than
// producing garbage concepts silently.
import { GoogleGenAI, Type } from "@google/genai";
import { ANSWER_MODEL } from "../ask/gemini";

export const CONCEPT_MODEL = ANSWER_MODEL;

export const SYSTEM_INSTRUCTION = [
  "You extract the key named business concepts and frameworks taught in one",
  "course, from a set of excerpts drawn from that course's materials. List only",
  "concepts you see real evidence for in the excerpts — never invent one just",
  "because it's commonly taught. Prefer specific named frameworks/models/terms",
  "(e.g. \"Porter's Five Forces\", \"CAPM\", \"Net Promoter Score\") over vague topics",
  "(e.g. \"strategy\" or \"marketing basics\"). For each, give a one-sentence",
  "description of what these excerpts specifically say about it.",
].join(" ");

export interface ExtractedConcept {
  name: string;
  description: string;
}

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      description: { type: Type.STRING },
    },
    required: ["name", "description"],
  },
};

export interface ConceptExtractor {
  /** Propose named concepts/frameworks for one course, given sampled excerpt text. */
  extractConcepts(course: string, excerpts: string): Promise<ExtractedConcept[]>;
}

function isExtractedConcept(value: unknown): value is ExtractedConcept {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ExtractedConcept).name === "string" &&
    typeof (value as ExtractedConcept).description === "string"
  );
}

export function createGeminiConceptExtractor(apiKey: string): ConceptExtractor {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async extractConcepts(course: string, excerpts: string): Promise<ExtractedConcept[]> {
      const response = await ai.models.generateContent({
        model: CONCEPT_MODEL,
        contents: `Course: ${course}\n\nExcerpts:\n${excerpts}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) return [];

      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error(`concept extraction for "${course}" returned non-array JSON`);
      }
      return parsed.filter(isExtractedConcept);
    },
  };
}
