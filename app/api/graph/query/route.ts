import { NextRequest, NextResponse } from 'next/server';
import graphRetriever from '@/services/graph/retriever';

/**
 * Direct Graph Query API Endpoint
 * 
 * This endpoint allows direct execution of Cypher queries against the Neo4j database.
 * It's a simpler alternative to the RAG endpoint for cases where the client already has a Cypher query.
 * 
 * Example request:
 * ```
 * POST /api/graph/query
 * {
 *   "cypher": "MATCH (n:User)-[:LOCATED_IN]->(l:Location {name: 'Canada'}) RETURN n, l",
 *   "limit": 100
 * }
 * ```
 */
export async function POST(req: NextRequest) {
  try {
    const { cypher, limit = 100 } = await req.json();

    if (!cypher) {
      return NextResponse.json(
        { error: 'Cypher query must be provided' },
        { status: 400 }
      );
    }

    // Use graphRetriever service to execute the query
    const result = await graphRetriever.executeQuery(cypher, limit);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GRAPH QUERY API ERROR]', error);
    
    // Extract more helpful error information
    let errorMessage = 'Error executing query';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Identify common Neo4j errors
      if (errorMessage.includes('SyntaxError')) {
        errorMessage = 'Cypher syntax error in query';
        statusCode = 400;
      } else if (errorMessage.includes('Unauthorized')) {
        errorMessage = 'Authentication failed - check Neo4j credentials';
        statusCode = 401;
      } else if (errorMessage.includes('ServiceUnavailable')) {
        errorMessage = 'Neo4j database is not accessible';
        statusCode = 503;
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.stack : 'Unknown error'
      },
      { status: statusCode }
    );
  }
} 