import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type AiCallResult = {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function askChatGPT(question: string): Promise<AiCallResult> {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search" }],
    input: question,
  });

  return {
    text: response.output_text ?? "",
    model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}
