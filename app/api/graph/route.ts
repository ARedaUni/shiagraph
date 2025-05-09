'use server';
import { NextRequest, NextResponse } from 'next/server';
import neo4j, { int, isInt } from 'neo4j-driver';

const uri = process.env.NEO4J_URI!;
const user = process.env.NEO4J_USER!;
const password = process.env.NEO4J_PASSWORD!;
// Create driver with proper error handling
let driver;
try {
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true, // → JS numbers instead of neo4j integers
  });
} catch (error) {
  console.error('Error initializing Neo4j driver:', error);
}

export async function POST(req: NextRequest) {
  try {
    const { relationshipTypes = [], limit = 100, cypher } = await req.json();

    // Ensure limit is an integer
    const intLimit = parseInt(limit, 10);

    /* Build the Cypher query -------------------------------------------------*/
    let query = cypher;
    
    // Default query if no cypher was provided
    if (!query) {
      const relFilter = relationshipTypes.length
        ? 'WHERE type(r) IN $relationshipTypes'
        : '';
      query = `
        MATCH (n)-[r]->(m)
        ${relFilter}
        RETURN n, r, m
        LIMIT $limit
      `;
    }

    /* Execute  ---------------------------------------------------------------*/
    if (!driver) {
      return NextResponse.json(
        { error: "Neo4j driver not initialized" },
        { status: 500 }
      );
    }

    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    
    try {
      console.log("Executing Cypher query:", query, "with limit:", intLimit);
      
      // Use neo4j.int() to ensure proper integer conversion if needed
      const params = { 
        relationshipTypes, 
        limit: neo4j.int(intLimit) 
      };
      
      const result = await session.run(query, params);

      /* Transform to D3‑friendly structure ------------------------------------*/
      const nodes: Record<string, any> = {};
      const links: any[] = [];

      for (const record of result.records) {
        
        // Process each field in the record
        for (const key of record.keys) {
          const item = record.get(key);
          
          // Skip null or undefined items
          if (!item || !item.identity) continue;
          
          // Process as a node if it has identity and labels properties
          if (item.labels) {
            const nodeId = item.identity;
            
            if (!nodes[nodeId]) {
              nodes[nodeId] = {
                id: nodeId,
                label: item.labels && item.labels[0] ? item.labels[0] : 'Unknown',
                ...item.properties,
              };
            }
          }
          
          // Process as a relationship if it has start, end, and type properties
          if (item.start !== undefined && item.end !== undefined && item.type) {
            // Store relationship with source and target as IDs
            links.push({
              id: item.identity,
              source: item.start,
              target: item.end,
              type: item.type,
              ...item.properties,
            });
          }
        }
      }
      
      // Now connect nodes and relationships
      const validLinks = links.filter(link => 
        nodes[link.source] && nodes[link.target]
      );

      /* Fetch all relationship types for filter‑UI ----------------------------*/
      const relTypesRes = await session.run(
        'CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) AS types'
      );
      
      return NextResponse.json(
        {
          nodes: Object.values(nodes),
          links: validLinks,
          relationshipTypesAvailable: relTypesRes.records[0].get('types'),
          executedQuery: query // Return the executed query for debugging
        },
        { status: 200 }
      );
    } catch (error) {
      console.error('Neo4j query execution error:', error);
      
      // Provide more helpful error messages for common issues
      let errorMessage = 'Database query error';
      let statusCode = 400;
      
      if ((error as any).code === 'Neo.ClientError.Security.Unauthorized') {
        errorMessage = 'Authentication failed - check Neo4j credentials';
      } else if ((error as any).code === 'Neo.ClientError.Statement.SyntaxError') {
        errorMessage = 'Cypher syntax error in query';
      } else if ((error as any).code?.includes('ServiceUnavailable')) {
        errorMessage = 'Neo4j database is not accessible';
        statusCode = 503;
      } else if ((error as any).code === 'Neo.ClientError.Statement.ArgumentError') {
        errorMessage = 'Invalid argument in Cypher query - check parameter types';
      }
      
      return NextResponse.json({ 
        error: errorMessage, 
        details: (error as any).message,
        code: (error as any).code || 'UNKNOWN'
      }, { status: statusCode });
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error('[GRAPH API ERROR]', err);
    return NextResponse.json({ error: 'Unable to fetch graph' }, { status: 500 });
  }
}