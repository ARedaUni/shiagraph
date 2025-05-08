import { google } from '@ai-sdk/google';
import { Message } from 'ai';
import { streamText } from 'ai';
import { Message as AppMessage } from '@/lib/types';
import { generateUUID } from '@/lib/utils';
import graphRAG from '@/services/graph/graphRAG';
import graphRetriever from '@/services/graph/retriever';

// No longer need to check for API key here since it's handled in the LLMClient

// Helper function to split text into word-level chunks
function splitIntoTokens(text: string, maxLength = 10) {
  const words = text.split(/\b/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += maxLength) {
    chunks.push(words.slice(i, i + maxLength).join(''));
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

// Helper function to extract Cypher query from text
function extractCypherQuery(text: string): string | null {
  const cypherMatch = text.match(/```CYPHER:([^`]+)```/);
  return cypherMatch ? cypherMatch[1].trim() : null;
}

export async function POST(req: Request) {
  try {
    // Extract query and graphMetadata from request body
    const { query, graphMetadata } = await req.json();
    
    if (!query) {
      return new Response(JSON.stringify({ error: 'No query provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create a stream for the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Process the query through the GraphRAG service with graphMetadata
          const ragResponsePromise = graphRAG.processQuery(query, graphMetadata);
          
          // Create a buffer to accumulate text for smoother streaming
          let buffer = '';
          let fullResponse = '';
          
          // Set up callback for streaming tokens
          const streamCallback = (token: string) => {
            buffer += token;
            fullResponse += token;
            
            // Split buffer into smaller chunks for smoother streaming
            if (buffer.length > 0) {
              const tokens = splitIntoTokens(buffer);
              if (tokens.length > 0) {
                // Send each token separately for smoother streaming
                for (const token of tokens) {
                  const formattedChunk = JSON.stringify({
                    content: token
                  });
                  controller.enqueue(encoder.encode(`data: ${formattedChunk}\n\n`));
                }
                // Clear the buffer after processing tokens
                buffer = '';
              }
            }
          };
          
          // Stream the text response while waiting for graph data
          // This simulates streaming from the GraphRAG service until we have true streaming there
          const simulateStream = async (text: string) => {
            const words = text.split(/\b/);
            
            for (const word of words) {
              // Add artificial delay for a natural typing effect
              await new Promise(resolve => setTimeout(resolve, 10));
              streamCallback(word);
            }
          };
          
          
          // Wait for the full GraphRAG response
          const ragResponse = await ragResponsePromise;
          
          // Clear the "Processing" message and stream the actual content
          streamCallback("\n\n");
          fullResponse = ""; // Reset the fullResponse for the actual content
          
          // Stream the actual response text from GraphRAG (already formatted)
          await simulateStream(ragResponse.text);
          
          // If there's graph data, send it to update the visualization
          if (ragResponse.graphData) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'graph_update',
              data: ragResponse.graphData
            })}\n\n`));
          } else if (!ragResponse.graphData) {
            // If there's no graph data from RAG but the response contains a Cypher query,
            // try to execute it and get graph data
            const cypherQuery = extractCypherQuery(fullResponse);
            if (cypherQuery) {
              try {
                const graphData = await graphRetriever.executeQuery(cypherQuery);
                
                // Send graph update event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'graph_update',
                  data: graphData
                })}\n\n`));
              } catch (error) {
                console.error('Error executing extracted Cypher query:', error);
                // Send error message but don't halt the stream
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: `Error executing Cypher query: ${error instanceof Error ? error.message : String(error)}`
                })}\n\n`));
              }
            }
          }
          
          // If there are follow-up questions, send them
          if (ragResponse.followUpQuestions && ragResponse.followUpQuestions.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'follow_up_questions',
              questions: ragResponse.followUpQuestions
            })}\n\n`));
          }
          
          // Close the stream
          controller.close();
        } catch (error) {
          console.error('Error in stream processing:', error);
          // Send error message to client
          const errorMessage = JSON.stringify({
            error: `Error processing query: ${error instanceof Error ? error.message : String(error)}`
          });
          controller.enqueue(encoder.encode(`data: ${errorMessage}\n\n`));
          controller.close();
        }
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
