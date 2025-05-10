import { NextRequest, NextResponse } from "next/server";
import { LangChainGraph } from "../../../../services/langChainGraph";

// Create and initialize the graph service
const graphService = new LangChainGraph({
  url: process.env.NEO4J_URI || "",
  username: process.env.NEO4J_USER || "",
  password: process.env.NEO4J_PASSWORD || "",
  model: process.env.GEMINI_MODEL || "gemini-flash-2.0-lite-001",
});

// Initialize the service
let isInitialized = false;
async function ensureInitialized() {
  if (!isInitialized) {
    await graphService.initialize();
    isInitialized = true;
  }
}

// Cache for metadata to avoid recalculating on every request
let metadataCache: any = null;
let lastMetadataRefresh = 0;
const METADATA_CACHE_TTL = 1000 * 60 * 10; // 10 minutes in milliseconds

export async function GET() {
  try {
    // Initialize the graph service if not already done
    await ensureInitialized();
    
    const now = Date.now();
    
    // Check if metadata cache is still valid
    if (metadataCache && now - lastMetadataRefresh < METADATA_CACHE_TTL) {
      console.log("Using cached graph metadata");
      return NextResponse.json(metadataCache);
    }
    
    console.log("Calculating fresh graph metadata");

    // Get the schema (this will use the cached schema in the LangChainGraph service)
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
    
    // Create the metadata object
    metadataCache = {
      relationshipTypes: Array.from(relationships),
      nodeLabels: Array.from(nodeLabels),
      nodeCount: nodeCount,
      schema: schema,
    };
    
    // Update the last refresh timestamp
    lastMetadataRefresh = now;

    // Return the metadata
    return NextResponse.json(metadataCache);
  } catch (error: any) {
    console.error("Error fetching graph metadata:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch graph metadata" },
      { status: 500 }
    );
  }
} 