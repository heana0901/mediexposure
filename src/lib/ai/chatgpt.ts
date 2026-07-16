import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function askChatGPT(question: string): Promise<string> {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    tools: [{ type: "web_search" }],
    input: question,
  });

  return response.output_text ?? "";
}
