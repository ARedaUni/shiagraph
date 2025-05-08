import { NextRequest, NextResponse } from "next/server";
import { LangChainGraph } from "../../../../services/graph/langChainGraph";

// Create and initialize the graph service
const graphService = new LangChainGraph({
  url: process.env.NEO4J_URI || "",
  username: process.env.NEO4J_USER || "",
  password: process.env.NEO4J_PASSWORD || "",
  model: process.env.GEMINI_MODEL || "gemini-flash-2.0-001",
});

// Initialize the service
let isInitialized = false;
async function ensureInitialized() {
  if (!isInitialized) {
    await graphService.initialize();
    isInitialized = true;
  }
}

export async function GET() {
  try {
    // Initialize the graph service if not already done
    await ensureInitialized();

    // Get the schema
    const schema = await graphService.getSchema();
    
    // Extract relationship types using regex
    const relationshipRegex = /\(:(\w+)\)-\[:(\w+)\]->.*?/g;
    const relationships = new Set<string>();
    let match;
    
    while ((match = relationshipRegex.exec(schema)) !== null) {
      relationships.add(match[2]); // Add relationship type
    }

    // Extract node labels using regex
    const nodeRegex = /(\w+) {.*?}/g;
    const nodeLabels = new Set<string>();
    
    while ((match = nodeRegex.exec(schema)) !== null) {
      nodeLabels.add(match[1]); // Add node label
    }
    
    // Count the number of nodes (this is an approximation from the schema)
    const nodeCount = nodeLabels.size;

    // Return the metadata
    return NextResponse.json({
      relationshipTypes: Array.from(relationships),
      nodeLabels: Array.from(nodeLabels),
      nodeCount: nodeCount,
      schema: schema,
    });
  } catch (error: any) {
    console.error("Error fetching graph metadata:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch graph metadata" },
      { status: 500 }
    );
  }
} 