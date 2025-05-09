import { NextRequest, NextResponse } from "next/server";
import { LangChainGraph } from "../../../../services/langChainGraph";

// Create and initialize the graph service
const graphService = new LangChainGraph({
  url: process.env.NEO4J_URI || "",
  username: process.env.NEO4J_USER || "",
  password: process.env.NEO4J_PASSWORD || "",
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash-001",
});

// Initialize the service
let isInitialized = false;
async function ensureInitialized() {
  if (!isInitialized) {
    await graphService.initialize();
    isInitialized = true;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Initialize the graph service if not already done
    await ensureInitialized();

    // Parse the request JSON
    const { question, stream = false, graphMetadata } = await req.json();

    // Validate required fields
    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    // If there's graph metadata provided, we could use it in the future to enhance the prompt
    // This is a placeholder for future enhancements
    if (graphMetadata) {
      console.log("Using graph metadata:", graphMetadata);
      // You could potentially update the schema or prompts based on this metadata
    }

    // If streaming is requested
    if (stream) {
      try {
        // Create a simple Node.js readable stream for compatibility
        const { readable, writable } = new TransformStream();
        const encoder = new TextEncoder();
        
        // Start the async process
        (async () => {
          try {
            const writer = writable.getWriter();
            
            // Get the response directly without streaming
            const result = await graphService.query(question);
            
            // Then artificially stream it by chunks
            const chunks = result.answer.match(/.{1,5}/g) || [];
            for (const chunk of chunks) {
              await writer.write(encoder.encode(chunk));
              // Small delay for a streaming effect
              await new Promise(r => setTimeout(r, 10));
            }
            
            writer.close();
          } catch (err) {
            console.error("Error in streaming:", err);
          }
        })();
        
        // Return the stream
        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      } catch (error: any) {
        console.error("Error in streaming graph query:", error);
        return NextResponse.json(
          { error: error.message || "Failed to stream graph query" },
          { status: 500 }
        );
      }
    } else {
      // Non-streaming response
      const response = await graphService.query(question);

      // Return the response
      return NextResponse.json({
        response: response.answer,
        followupQuestions: [], // The LangChainGraph doesn't return followup questions
        cypher: 'cypher' in response ? response.cypher : null,
      });
    }
  } catch (error: any) {
    console.error("Error in LangChain graph query:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process graph query" },
      { status: 500 }
    );
  }
} 