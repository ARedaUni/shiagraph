import { Message } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { fetchEventSource } from "@microsoft/fetch-event-source";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/chat/stream";

export async function streamChat({ 
  inputContent, 
  setIsLoading, 
  append 
}: { 
  inputContent: string; 
  setIsLoading: (loading: boolean) => void; 
  append: (message: Message) => Promise<string | null | undefined>;
}) {
  setIsLoading(true);

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: inputContent,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Create a new message to display the assistant's response
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      content: "",
      role: "assistant",
    };

    // Set up the event source for server-sent events
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Response body is null");
    }

    let done = false;
    let contentBuffer = '';
    const UPDATE_THRESHOLD = 5; // Update UI after collecting this many characters
    
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;

      if (done) {
        // Flush any remaining content in the buffer
        if (contentBuffer.length > 0) {
          assistantMessage.content += contentBuffer;
          await append(assistantMessage);
          contentBuffer = '';
        }
        break;
      }

      // Decode the chunk and split by event delimiter
      const chunk = decoder.decode(value, { stream: true });
      const events = chunk.split("\n\n").filter(Boolean);

      for (const event of events) {
        if (event.startsWith("data: ")) {
          try {
            const data = JSON.parse(event.slice(6));

            // Handle different types of events
            if (data.type === 'graph_update') {
              // Graph update event - dispatch a custom event to update GraphViewer
              dispatchGraphUpdateEvent(data);
            } else if (data.content !== undefined) {
              // Collect content in buffer
              contentBuffer += data.content;
              
              // Only update UI when we have enough content or on special characters
              if (contentBuffer.length >= UPDATE_THRESHOLD || 
                  contentBuffer.includes('\n') || 
                  contentBuffer.includes('.') || 
                  contentBuffer.includes('?') || 
                  contentBuffer.includes('!')) {
                assistantMessage.content += contentBuffer;
                await append(assistantMessage);
                contentBuffer = '';
              }
            }
          } catch (error) {
            console.error("Error parsing SSE data:", error, event);
          }
        }
      }
    }

    // Finish
    setIsLoading(false);
    return assistantMessage.content;
  } catch (error) {
    console.error("Error streaming chat:", error);
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

// Helper function to dispatch graph update events
function dispatchGraphUpdateEvent(data: any) {
  try {
    // Create and dispatch a custom event with the graph data
    const event = new MessageEvent('message', {
      data: JSON.stringify(data)
    });
    document.dispatchEvent(event);
  } catch (error) {
    console.error("Error dispatching graph update event:", error);
  }
}