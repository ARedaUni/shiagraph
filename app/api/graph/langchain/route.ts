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
        const streamResponse = await graphService.streamQuery(question);
        
        // Cast the stream to the proper type expected by Response
        return new Response(streamResponse as unknown as ReadableStream, {
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
        response: response.result,
        followupQuestions: response.followupQuestions || [],
        cypher: response.query,
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