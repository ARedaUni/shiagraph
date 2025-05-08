import { google } from '@ai-sdk/google';
import { Message } from 'ai';
import { streamText } from 'ai';
import { Message as AppMessage } from '@/lib/types';
import { generateUUID } from '@/lib/utils';

// Check if API key is available
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable');
}

// Initialize Google Generative AI provider with API key
const googleAI = google('gemini-2.0-flash-001', {
  // Optional safety settings
  safetySettings: [
    { 
      category: 'HARM_CATEGORY_HATE_SPEECH', 
      threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
    },
    { 
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT', 
      threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
    },
    { 
      category: 'HARM_CATEGORY_HARASSMENT', 
      threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
    },
    { 
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 
      threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
    },
  ],
});

// Neo4j Cypher query generator system prompt
const NEO4J_SYSTEM_PROMPT = `You are a Neo4j Cypher query generator. Convert natural language questions about graph data into Cypher queries.
When users ask about relationships, entities, or connections, create appropriate Cypher queries.
Your responses should include:
1. A conversational answer to the user's question
2. A Cypher query enclosed in triple backticks with the prefix "CYPHER:" that can be executed against a Neo4j database
Example: When user asks "Show me who knows John", respond with both an explanation and the Cypher query like:
"I'll show you who knows John. Here's the graph visualization:"
\`\`\`CYPHER:
MATCH (p:Person)-[r:KNOWS]->(friend {name: "John"})
RETURN p, r, friend LIMIT 100
\`\`\`
For general questions unrelated to the graph, respond normally without including a Cypher query.`;

// Helper function to split text into word-level chunks
function splitIntoTokens(text: string, maxLength = 10) {
  const words = text.split(/\b/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += maxLength) {
    chunks.push(words.slice(i, i + maxLength).join(''));
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

export async function POST(req: Request) {
  try {
    // Extract query from request body to match clients.ts expectation
    const { query } = await req.json();
    
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create messages with system prompt for neo4j query generation
    const messages: any[] = [
      { 
        role: 'system',
        content: NEO4J_SYSTEM_PROMPT
      },
      { 
        role: 'user',
        content: query
      }
    ];

    // Stream the response from Gemini
    const result = await streamText({
      model: googleAI,
      messages,
      providerOptions: {
        google: {
          responseModalities: ['TEXT'],
        }
      }
    });

    // Create a stream that formats responses to match client expectations
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        let buffer = '';
        
        for await (const chunk of result.textStream) {
          // Accumulate the full response
          fullResponse += chunk;
          buffer += chunk;
          
          // Split buffer into smaller chunks for smoother streaming
          // Only send complete words/tokens
          if (buffer.length > 0) {
            const tokens = splitIntoTokens(buffer);
            if (tokens.length > 0) {
              // Send each token separately for smoother streaming
              for (const token of tokens) {
                const formattedChunk = JSON.stringify({
                  content: token
                });
                controller.enqueue(encoder.encode(`data: ${formattedChunk}\n\n`));
                
                // Small delay for more natural typing effect
                await new Promise(resolve => setTimeout(resolve, 10));
              }
              // Clear the buffer after processing tokens
              buffer = '';
            }
          }
        }
        
        // After streaming the content to the client, check for Cypher query
        const cypherMatch = fullResponse.match(/```CYPHER:([^`]+)```/);
        // if (cypherMatch && cypherMatch[1]) {
        //   const cypherQuery = cypherMatch[1].trim();
          
        //   // Call the graph API with the generated Cypher query
        //   try {
        //     const graphResponse = await fetch(new URL('/api/graph', req.url), {
        //       method: 'POST',
        //       headers: { 'Content-Type': 'application/json' },
        //       body: JSON.stringify({ cypher: cypherQuery }),
        //     });
            
        //     // If successful, send a special "graph_update" event
        //     if (graphResponse.ok) {
        //       const graphData = await graphResponse.json();
        //       controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        //         type: 'graph_update',
        //         data: graphData
        //       })}\n\n`));
        //     }
        //   } catch (error) {
        //     console.error('Error calling graph API:', error);
        //   }
        // }
        
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[CHAT ERROR]', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
