import { Message } from "@/lib/types";

export async function queryLangChainGraph({ 
  question, 
  setIsLoading, 
  append,
  graphMetadata,
  useStreaming = false
}: { 
  question: string; 
  setIsLoading: (loading: boolean) => void; 
  append: (message: Message) => Promise<string | null | undefined>;
  graphMetadata?: {
    relationshipTypes: string[];
    nodeCount: number;
    nodeLabels?: string[];
  };
  useStreaming?: boolean;
}) {
  setIsLoading(true);
  console.log("Querying LangChain Graph with:", question);

  // Create a new message to display the assistant's response
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    content: "",
    role: "assistant",
  };
  
  try {
    if (useStreaming) {
      // Handle streaming response
      const response = await fetch("/api/graph/langchain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          graphMetadata,
          stream: true
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      if (!response.body) {
        throw new Error("No response body returned");
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Initial empty message
      await append(assistantMessage);
      
      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode the chunk and update the message
        const text = decoder.decode(value);
        assistantMessage.content += text;
        await append(assistantMessage);
      }
      
      // Process follow-up questions at the end if needed
      const followupMatch = assistantMessage.content.match(/follow-up questions?:?\s*((?:(?:\d+\.\s*|[-•]\s*).*\n?)+)/i);
      if (followupMatch && followupMatch[1]) {
        const questions = followupMatch[1]
          .split(/\n/)
          .map(q => q.replace(/^\d+\.\s*|[-•]\s*/, '').trim())
          .filter(q => q.length > 0);
          
        // Format follow-up questions for button rendering
        for (const question of questions) {
          assistantMessage.content += `\n\n{{follow_up_question:${question}}}`;
          await append(assistantMessage);
        }
      }
    } else {
      // Handle non-streaming response
      const response = await fetch("/api/graph/langchain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          graphMetadata
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Set the content from the response
      assistantMessage.content = data.response;
      await append(assistantMessage);
      
      // If there are follow-up questions, add them to the message
      if (data.followupQuestions && data.followupQuestions.length > 0) {
        for (const question of data.followupQuestions) {
          // Format follow-up questions for button rendering
          assistantMessage.content += `\n\n{{follow_up_question:${question}}}`;
          await append(assistantMessage);
        }
      }
      
      // If there's a Cypher query, it can be passed to a visualization component
      if (data.cypher) {
        console.log("Cypher query from LangChain:", data.cypher);
        // You can add code here to handle the Cypher query if needed
      }
    }
    
    return assistantMessage.content;
  } catch (error) {
    console.error("Error in LangChain query:", error);
    
    // Create an error message
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      content: "Sorry, there was an error processing your request. Please try again.",
      role: "assistant",
    };
    await append(errorMessage);
    
    return null;
  } finally {
    setIsLoading(false);
  }
} 