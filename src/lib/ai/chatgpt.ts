import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type Source = { title: string; url: string };

export type AiCallResult = {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  sources: Source[];
};

function extractSources(response: OpenAI.Responses.Response): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];

  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation" && !seen.has(annotation.url)) {
          seen.add(annotation.url);
          sources.push({ title: annotation.title || annotation.url, url: annotation.url });
        }
      }
    }
  }

  return sources;
}

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
    sources: extractSources(response),
  };
}
