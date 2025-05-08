import { Message } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { fetchEventSource } from "@microsoft/fetch-event-source";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/chat/stream";

export async function streamChat({ 
  inputContent, 
  setIsLoading, 
  append,
  graphMetadata
}: { 
  inputContent: string; 
  setIsLoading: (loading: boolean) => void; 
  append: (message: Message) => Promise<string | null | undefined>;
  graphMetadata?: {
    relationshipTypes: string[];
    nodeCount: number;
    nodeLabels?: string[];
  };
}) {
  setIsLoading(true);
  console.log("Starting stream chat with query:", inputContent);

  // Create a new message to display the assistant's response
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    content: "",
    role: "assistant",
  };

  // Track if we're currently receiving a follow-up message
  let receivingFollowUp = false;
  
  try {
    // Using fetchEventSource which handles SSE more robustly
    await fetchEventSource("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: inputContent,
        graphMetadata
      }),
      async onmessage(event) {
        try {
          console.log("Event received:", event.data.substring(0, 50) + "...");
          const data = JSON.parse(event.data);
          
          // Handle text content
          if (data.content !== undefined) {
            let cleanContent = data.content;
            
            // Skip empty content after cleaning
            if (cleanContent.trim() === '') {
              return;
            }
            
            // Add the cleaned content to the message
            assistantMessage.content += cleanContent;
            await append(assistantMessage);
            console.log("Updated UI with content, total length:", assistantMessage.content.length);
          }
          
          // Handle follow-up questions with special marker for UI rendering
          if (data.type === 'follow_up_questions' && data.questions && data.questions.length > 0) {
            // Clean up question - remove any explanations
            let cleanQuestion = data.questions[0].split(/[.(]/, 1)[0].trim();
            
            // Special marker for the UI to render as a button
            const formattedQuestion = `\n\n{{follow_up_question:${cleanQuestion}}}`;
            
            assistantMessage.content += formattedQuestion;
            await append(assistantMessage);
          }
          
          // Handle graph data - visualization is handled by the UI
          if (data.type === 'graph_update' && data.data) {
            console.log("Graph data received - visualization should update");
          }
          
          // Handle error messages
          if (data.error) {
            assistantMessage.content += `\n\nError: ${data.error}`;
            await append(assistantMessage);
          }
        } catch (error) {
          console.error("Error processing event:", error);
        }
      },
      async onopen(response) {
        console.log("Stream connection opened:", response.status);
        if (response.ok) {
          console.log("Response OK, status:", response.status);
        } else {
          console.error("Stream response not OK:", response.status);
        }
      },
      onerror(err) {
        console.error("Stream error:", err);
        throw err;
      },
      onclose() {
        console.log("Stream connection closed");
        setIsLoading(false);
      }
    });

    return assistantMessage.content;
  } catch (error) {
    console.error("Error in stream chat:", error);
    setIsLoading(false);
    
    // Create an error message
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      content: "Sorry, there was an error processing your request. Please try again.",
      role: "assistant",
    };
    await append(errorMessage);
    
    return null;
  }
}