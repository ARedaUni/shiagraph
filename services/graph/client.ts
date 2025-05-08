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
    const links: any[] = [];
    
    console.log('Transforming Neo4j results:', {
      recordCount: result.records.length,
      keys: result.records.length > 0 ? result.records[0].keys : []
    });
    
    // Handle scalar property results (u.name, etc.)
    const hasOnlyScalarResults = result.records.length > 0 && 
      result.records[0].keys.every(key => String(key).includes('.'));
      
    if (hasOnlyScalarResults && result.records.length > 0) {
      console.log('Detected scalar property results - creating visualization nodes');
      
      // Group by entity prefix (e.g., 'u' from 'u.name')
      const entityGroups: Record<string, Record<string, any>> = {};
      
      // Process all records
      for (let i = 0; i < result.records.length; i++) {
        const record = result.records[i];
        
        // Each record represents an entity
        const nodeId = `result_${i}`;
        const properties: Record<string, any> = {};
        
        // Extract all properties from this record
        for (const key of record.keys) {
          const keyStr = String(key);
          const value = record.get(key);
          
          // Skip null values
          if (value === null || value === undefined) continue;
          
          // Extract entity prefix and property name
          const [entityPrefix, propName] = keyStr.split('.');
          
          // Initialize entity group if needed
          if (!entityGroups[entityPrefix]) {
            entityGroups[entityPrefix] = {};
          }
          
          // Add this property to the entity
          properties[propName || keyStr] = value;
          
          // Store in entity group
          entityGroups[entityPrefix][propName || keyStr] = value;
        }
        
        // Create a node for this record
        if (Object.keys(properties).length > 0) {
          // Use a name property if available, otherwise first property value
          const propKeys = Object.keys(properties);
          const name = properties.name || properties.title || 
            (propKeys.length > 0 ? `${propKeys[0]}: ${properties[propKeys[0]]}` : nodeId);
            
          nodesMap[nodeId] = {
            id: nodeId,
            name: name,
            group: 'Result', 
            label: 'Result',
            properties: properties,
            labels: ['Result'],
          };
        }
      }
      
      // Create relationships between related entities if possible
      const nodeIds = Object.keys(nodesMap);
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          // Simple relationship for visualization
          links.push({
            id: `link_${i}_${j}`,
            source: nodeIds[i],
            target: nodeIds[j],
            type: 'RELATED',
            value: 1
          });
        }
      }
    } else {
      // Process regular node/relationship records
      // Process all records
      for (const record of result.records) {
        // Process all fields in each record
        for (const key of record.keys) {
          const item = record.get(key);
          
          // Skip null or undefined items
          if (!item) continue;
          
          console.log(`Processing item with key "${String(key)}":`, {
            hasIdentity: item.identity !== undefined,
            hasLabels: !!item.labels,
            hasLabel: !!item.label,
            isRelationship: item.identity !== undefined && item.start !== undefined && 
                          item.end !== undefined && item.type !== undefined
          });
          
          // Process as a node if it has identity and labels properties
          if (item.identity !== undefined && (item.labels || item.label)) {
            const nodeId = item.identity.toString();
            
            if (!nodesMap[nodeId]) {
              // Extract properties and ensure they're properly formatted
              const name = item.properties?.name || item.properties?.title || nodeId;
              const description = item.properties?.description || item.properties?.summary || '';
              
              // Determine group/label from first label
              const primaryLabel = item.labels && item.labels.length > 0 ? item.labels[0] : 
                                 (item.label ? item.label : 'Unknown');
              
              nodesMap[nodeId] = {
                id: nodeId,
                name: name,
                group: primaryLabel,
                label: primaryLabel,
                description: description,
                properties: item.properties || {},
                labels: item.labels || [item.label].filter(Boolean),
                // D3 will add these x, y, etc. properties during simulation
              };
              
              console.log(`Added node ${nodeId} with label ${primaryLabel}`);
            }
          }
          
          // Process as a relationship if it has identity, start, end, and type properties
          if (item.identity !== undefined && item.start !== undefined && 
              item.end !== undefined && item.type !== undefined) {
            
            const sourceId = typeof item.start === 'number' ? item.start.toString() : item.start;
            const targetId = typeof item.end === 'number' ? item.end.toString() : item.end;
            
            // Store relationship for later processing (after all nodes are processed)
            links.push({
              id: item.identity.toString(),
              source: sourceId,
              target: targetId,
              type: item.type || 'RELATED',
              value: item.properties?.weight || item.properties?.value || 1,
              ...item.properties,
            });
            
            console.log(`Added relationship ${item.type} from ${sourceId} to ${targetId}`);
          }
        }
      }
    }
    
    // Filter links to only include those with valid source and target nodes
    const validLinks = links.filter(link => 
      nodesMap[link.source] && nodesMap[link.target]
    );
    
    console.log('Transformation complete:', {
      totalNodes: Object.keys(nodesMap).length,
      totalLinks: links.length,
      validLinks: validLinks.length
    });
    
    return {
      nodes: Object.values(nodesMap),
      links: validLinks,
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