/**
 * Client helper that calls our /api/graph/langchain endpoints.
 * – Ensures exactly ONE follow-up button (no duplicate text).
 */
import { Message } from "@/lib/types";

export async function queryLangChainGraph({
  question,
  setIsLoading,
  append,
  graphMetadata,
  useStreaming = true,
}: {
  question: string;
  setIsLoading: (b: boolean) => void;
  append: (m: Message) => Promise<string | null>;
  graphMetadata?: {
    relationshipTypes: string[];
    nodeCount: number;
    nodeLabels?: string[];
  };
  useStreaming?: boolean;
}) {
  setIsLoading(true);

  const assistantMsg: Message = {
    id: crypto.randomUUID(),
    content: "",
    role: "assistant",
  };

  try {
    /* ------------------------ STREAMING --------------------------- */
    if (useStreaming) {
      const res = await fetch("/api/graph/langchain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, graphMetadata, stream: true }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      await append(assistantMsg); // initial placeholder

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done) {
        try {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          
          if (value) {
            // Decode the current chunk
            const chunkText = decoder.decode(value, { stream: true });
            buffer += chunkText;
            
            // Update the message with the new content
            assistantMsg.content = buffer;
            await append(assistantMsg);
          }
        } catch (error) {
          console.error("Error reading from stream:", error);
          done = true;
        }
      }
      
      // Final decoding to handle any remaining bytes
      const final = decoder.decode();
      if (final) {
        buffer += final;
        assistantMsg.content = buffer;
        await append(assistantMsg);
      }

      /* Remove any accidental FollowUp text; the server already appends
         the {{follow_up_question:…}} marker we need for the button.     */
      assistantMsg.content = assistantMsg.content.replace(
        /^FollowUp:.*$/im,
        ""
      );
      await append(assistantMsg);
      return assistantMsg.content;
    }

    /* --------------------- NON-STREAMING -------------------------- */
    const res = await fetch("/api/graph/langchain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, graphMetadata }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    assistantMsg.content = data.answer || data.response || "";
    if (data.followUp) {
      assistantMsg.content += `\n\n{{follow_up_question:${data.followUp}}}`;
    }
    await append(assistantMsg);
    return assistantMsg.content;
  } catch (err) {
    console.error(err);
    await append({
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Sorry – something went wrong while talking to the graph. Please try again.",
    });
    return null;
  } finally {
    setIsLoading(false);
  }
}
