import neo4j, { Driver, QueryResult, Session } from 'neo4j-driver';

/**
 * Neo4j client service for connecting to and querying the database
 */
export class Neo4jClient {
  private driver: Driver | null = null;
  private static instance: Neo4jClient | null = null;

  private constructor() {
    this.initialize();
  }

  /**
   * Get the singleton instance of Neo4jClient
   */
  public static getInstance(): Neo4jClient {
    if (!Neo4jClient.instance) {
      Neo4jClient.instance = new Neo4jClient();
    }
    return Neo4jClient.instance;
  }

  /**
   * Initialize the Neo4j driver with environment variables
   */
  private initialize(): void {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
      console.error('Missing Neo4j credentials in environment variables');
      return;
    }

    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        disableLosslessIntegers: true, // → JS numbers instead of neo4j integers
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2000,
      });
      console.log('Neo4j driver initialized successfully');
    } catch (error) {
      console.error('Error initializing Neo4j driver:', error);
      this.driver = null;
    }
  }

  /**
   * Execute a Cypher query against the Neo4j database
   * @param query Cypher query to execute
   * @param params Parameters for the query
   * @returns Result of the query execution
   */
  public async executeQuery(query: string, params: Record<string, any> = {}): Promise<QueryResult> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }

    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    
    try {
      console.log('Executing Cypher query:', query, 'with params:', params);
      const result = await session.run(query, params);
      return result;
    } finally {
      await session.close();
    }
  }

  /**
   * Transform Neo4j results into a graph visualization format
   * matching the Node and Link interfaces expected by ImprovedGraph.tsx
   * 
   * @param result Result from Neo4j query
   * @returns Nodes and links for visualization
   */
  public transformToGraph(result: QueryResult): { nodes: any[], links: any[] } {
    // First, create all nodes
    const nodesMap: Record<string, any> = {};
    
    // Extract all nodes from records
    for (const record of result.records) {
      const nodeEntities = ['n', 'm']; // node keys to extract
      
      for (const key of nodeEntities) {
        const node = record.get(key);
        if (!node || !node.identity) continue;
        
        const nodeId = node.identity.toString();
        
        if (!nodesMap[nodeId]) {
          // Extract properties and ensure they're properly formatted
          const name = node.properties?.name || node.properties?.title || nodeId;
          const description = node.properties?.description || node.properties?.summary || '';
          
          // Determine group/label from first label
          const primaryLabel = node.labels && node.labels.length > 0 ? node.labels[0] : 'Unknown';
          
          nodesMap[nodeId] = {
            id: nodeId,
            name: name,
            group: primaryLabel,
            label: primaryLabel,
            description: description,
            properties: node.properties || {},
            labels: node.labels || [],
            // D3 will add these x, y, etc. properties during simulation
          };
        }
      }
    }
    
    // Now extract relationships as links
    const links: any[] = [];
    
    for (const record of result.records) {
      const r = record.get('r');
      if (!r || !r.identity) continue;
      
      const sourceId = typeof r.start === 'number' ? r.start.toString() : r.start;
      const targetId = typeof r.end === 'number' ? r.end.toString() : r.end;
      
      // Skip if source or target nodes weren't found
      if (!nodesMap[sourceId] || !nodesMap[targetId]) continue;
      
      // Get relationship value from properties if available
      const value = r.properties?.weight || r.properties?.value || 1;
      
      links.push({
        id: r.identity.toString(),
        source: sourceId, // Using ID as string (ImprovedGraph accepts string IDs)
        target: targetId, // Using ID as string (ImprovedGraph accepts string IDs)
        type: r.type || 'RELATED',
        value: value,
        ...r.properties,
      });
    }
    
    return {
      nodes: Object.values(nodesMap),
      links,
    };
  }

  /**
   * Close the Neo4j driver connection
   */
  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  /**
   * Execute a query and return graph data
   * @param cypher Cypher query to execute
   * @param limit Maximum number of results
   * @returns Graph data for visualization
   */
  public async queryGraph(cypher: string | null, limit: number = 100): Promise<{ nodes: any[], links: any[], executedQuery: string }> {
    let query = cypher;
    
    // Default query if no cypher was provided
    if (!query) {
      query = `
        MATCH (n)-[r]->(m)
        RETURN n, r, m
        LIMIT $limit
      `;
    }
    
    try {
      const result = await this.executeQuery(query, { limit });
      const graph = this.transformToGraph(result);
      
      return {
        ...graph,
        executedQuery: query
      };
    } catch (error) {
      console.error('Error executing graph query:', error);
      throw error;
    }
  }
}

export default Neo4jClient.getInstance(); 