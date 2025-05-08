import neo4jClient from './client';

/**
 * Types for graph data retrieval
 */
export interface GraphQueryResult {
  nodes: any[];
  links: any[];
  executedQuery: string;
  summary?: string;
}

/**
 * Graph Retriever Service
 * 
 * This service is responsible for retrieving graph data from Neo4j
 * based on either raw Cypher queries or structured query parameters.
 * It forms the "retrieval" part of our Graph RAG system.
 */
export class GraphRetriever {
  private static instance: GraphRetriever | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of GraphRetriever
   */
  public static getInstance(): GraphRetriever {
    if (!GraphRetriever.instance) {
      GraphRetriever.instance = new GraphRetriever();
    }
    return GraphRetriever.instance;
  }

  /**
   * Execute a raw Cypher query and return the graph data
   * 
   * @param cypher The Cypher query to execute
   * @param limit Maximum number of results to return
   * @returns Graph data (nodes and links) suitable for visualization
   */
  public async executeQuery(cypher: string, limit: number = 100): Promise<GraphQueryResult> {
    try {
      const result = await neo4jClient.queryGraph(cypher, limit);
      return result;
    } catch (error) {
      console.error('Error executing graph query:', error);
      throw error;
    }
  }

  /**
   * Extract a subgraph around a specific entity (node)
   * 
   * @param entityName Name of the entity to center the subgraph on
   * @param depth Depth of relationships to traverse
   * @param limit Maximum number of nodes to return
   * @returns Subgraph centered on the specified entity
   */
  public async getEntitySubgraph(entityName: string, depth: number = 1, limit: number = 100): Promise<GraphQueryResult> {
    const escapedName = entityName.replace(/"/g, '\\"');
    const cypher = `
      MATCH (center)
      WHERE center.name =~ "(?i).*${escapedName}.*" OR center.title =~ "(?i).*${escapedName}.*"
      WITH center LIMIT 1
      CALL {
        WITH center
        MATCH path = (center)-[*1..${depth}]-(related)
        RETURN related, relationships(path) as rels
        LIMIT ${limit}
      }
      RETURN center as n, related as m, rels[0] as r
      LIMIT ${limit}
    `;
    
    return this.executeQuery(cypher, limit);
  }

  /**
   * Extract a subgraph based on specific relationship types
   * 
   * @param relationshipTypes Types of relationships to include
   * @param limit Maximum number of results
   * @returns Subgraph containing only the specified relationship types
   */
  public async getRelationshipTypeSubgraph(relationshipTypes: string[], limit: number = 100): Promise<GraphQueryResult> {
    const relationshipFilter = relationshipTypes.map(type => `type(r) = "${type}"`).join(' OR ');
    const cypher = `
      MATCH (n)-[r]->(m)
      WHERE ${relationshipFilter}
      RETURN n, r, m
      LIMIT ${limit}
    `;
    
    return this.executeQuery(cypher, limit);
  }

  /**
   * Find the shortest path between two entities
   * 
   * @param sourceEntity Name of the source entity
   * @param targetEntity Name of the target entity
   * @param maxDepth Maximum path length to consider
   * @returns Subgraph showing the shortest path(s)
   */
  public async getShortestPath(sourceEntity: string, targetEntity: string, maxDepth: number = 5): Promise<GraphQueryResult> {
    const escapedSource = sourceEntity.replace(/"/g, '\\"');
    const escapedTarget = targetEntity.replace(/"/g, '\\"');
    
    const cypher = `
      MATCH (source), (target)
      WHERE source.name =~ "(?i).*${escapedSource}.*" AND target.name =~ "(?i).*${escapedTarget}.*"
      MATCH p = shortestPath((source)-[*1..${maxDepth}]-(target))
      UNWIND relationships(p) as r
      WITH startNode(r) as n, r, endNode(r) as m
      RETURN n, r, m
    `;
    
    return this.executeQuery(cypher);
  }

  /**
   * Extract a thematic subgraph based on keyword search across node properties
   * 
   * @param keywords Keywords to search for in node properties
   * @param limit Maximum number of results
   * @returns Subgraph containing nodes matching the keywords
   */
  public async getThematicSubgraph(keywords: string[], limit: number = 100): Promise<GraphQueryResult> {
    // Create a regex pattern for case-insensitive keyword matching
    const keywordPattern = keywords
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0)
      .map(keyword => `(?i).*${keyword.replace(/"/g, '\\"')}.*`)
      .join('|');
    
    if (!keywordPattern) {
      throw new Error('No valid keywords provided');
    }
    
    const cypher = `
      MATCH (n)-[r]->(m)
      WHERE any(prop IN keys(n) WHERE n[prop] =~ "${keywordPattern}")
         OR any(prop IN keys(m) WHERE m[prop] =~ "${keywordPattern}")
      RETURN n, r, m
      LIMIT ${limit}
    `;
    
    return this.executeQuery(cypher, limit);
  }

  /**
   * Find all entities of a specific type/label
   * 
   * @param label The node label to search for
   * @param limit Maximum number of results
   * @returns Subgraph containing nodes of the specified label
   */
  public async getEntitiesByType(label: string, limit: number = 100): Promise<GraphQueryResult> {
    const cypher = `
      MATCH (n:${label})-[r]->(m)
      RETURN n, r, m
      LIMIT ${limit}
    `;
    
    return this.executeQuery(cypher, limit);
  }
}

export default GraphRetriever.getInstance(); 