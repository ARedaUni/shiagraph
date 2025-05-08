import { NextRequest, NextResponse } from 'next/server';
import graphRAG from '@/services/graph/graphRAG';

/**
 * Graph RAG API Endpoint
 * 
 * This endpoint provides access to the full Graph Retrieval-Augmented Generation pipeline.
 * It processes natural language queries and returns both text responses and graph data.
 * 
 * Example request:
 * ```
 * POST /api/graph/rag
 * {
 *   "query": "Who is from Canada?",
 *   "includeFollowUp": true
 * }
 * ```
 */
export async function POST(req: NextRequest) {
  try {
    const { query, includeFollowUp = true } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: 'Query must be provided' },
        { status: 400 }
      );
    }

    // Process the query through the GraphRAG service
    const result = await graphRAG.processQuery(query);
    
    // Filter out follow-up questions if not requested
    if (!includeFollowUp) {
      delete result.followUpQuestions;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GRAPH RAG API ERROR]', error);
    
    return NextResponse.json(
      { 
        error: 'Error processing RAG query',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 