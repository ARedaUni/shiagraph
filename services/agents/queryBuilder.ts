import llmClient, { Message } from '../ai/llmClient';
import neo4jClient from '../graph/client';

/**
 * Response interface for Query Builder
 */
export interface QueryBuilderResponse {
  cypher: string;
  explanation: string;
  isValid: boolean;
  error?: string;
}

/**
 * Query Builder Agent
 * 
 * This service is responsible for converting natural language questions
 * into executable Cypher queries using LLM capabilities.
 */
export class QueryBuilderAgent {
  private static instance: QueryBuilderAgent | null = null;
  
  private constructor() {}
  
  /**
   * Get the singleton instance of QueryBuilderAgent
   */
  public static getInstance(): QueryBuilderAgent {
    if (!QueryBuilderAgent.instance) {
      QueryBuilderAgent.instance = new QueryBuilderAgent();
    }
    return QueryBuilderAgent.instance;
  }

  /**
   * System prompt template for query generation
   */
  private getSystemPrompt(): string {
    return `You are an expert in Neo4j and the Cypher query language. Your task is to convert natural language questions about a knowledge graph into executable Cypher queries.

The knowledge graph contains information from a Discord server with the following structure:
- User nodes with properties like name, location, interests
- Message nodes representing chat messages with content and timestamp
- Topic nodes representing discussion topics
- SENT relationship between User and Message
- MENTIONS relationship between Messages and Users/Topics
- INTERESTED_IN relationship between Users and Topics
- LOCATED_IN relationship between Users and locations

Respond with a valid Cypher query that answers the user's question. Focus on creating efficient, accurate queries. Wrap your query in triple backticks.

Examples:
1. Question: "Who is from Canada?"
   Cypher: \`\`\`MATCH (u:User)-[:LOCATED_IN]->(l:Location {name: "Canada"}) RETURN u.name, u.interests\`\`\`

2. Question: "What topics does user John discuss most?"
   Cypher: \`\`\`MATCH (u:User {name: "John"})-[:SENT]->(m:Message)-[:MENTIONS]->(t:Topic) 
   RETURN t.name, count(*) as frequency 
   ORDER BY frequency DESC LIMIT 5\`\`\`

3. Question: "Find connections between AI and spirituality topics"
   Cypher: \`\`\`MATCH path = (:Topic {name: "AI"})-[*1..3]-(:Topic {name: "spirituality"})
   RETURN path LIMIT 10\`\`\`

After your query, provide a brief explanation of how it works.`;
  }

  /**
   * Validate if a Cypher query is likely to be executable
   * This performs basic validation without actually running the query
   * 
   * @param cypher Cypher query to validate
   * @returns Whether the query appears valid
   */
  private validateCypherQuery(cypher: string): boolean {
    // Check if query contains basic MATCH pattern
    if (!cypher.includes('MATCH')) {
      return false;
    }
    
    // Check for balanced parentheses and brackets
    const openParens = (cypher.match(/\(/g) || []).length;
    const closeParens = (cypher.match(/\)/g) || []).length;
    
    if (openParens !== closeParens) {
      return false;
    }
    
    // Check for common Cypher keywords
    const hasReturnOrCreate = cypher.includes('RETURN') || 
                             cypher.includes('CREATE') || 
                             cypher.includes('MERGE');
    
    if (!hasReturnOrCreate) {
      return false;
    }
    
    return true;
  }

  /**
   * Extract Cypher query from LLM response
   * 
   * @param text The LLM response text
   * @returns Extracted Cypher query
   */
  private extractCypherQuery(text: string): string {
    // Modified regex to work without 's' flag by using [\s\S] to match any character including newlines
    const cypherPattern = /```(?:cypher)?\s*([\s\S]+?)```/;
    const match = cypherPattern.exec(text);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // If no code block, try to extract anything that looks like a Cypher query
    if (text.includes('MATCH') && text.includes('RETURN')) {
      const lines = text.split('\n');
      const cypherLines = lines.filter(line => 
        line.includes('MATCH') || 
        line.includes('WHERE') || 
        line.includes('RETURN') || 
        line.includes('ORDER BY')
      );
      
      return cypherLines.join('\n');
    }
    
    return text; // Return the whole text if no clear Cypher was found
  }

  /**
   * Convert a natural language question into a Cypher query
   * 
   * @param question Natural language question about the graph
   * @returns Generated Cypher query and explanation
   */
  public async buildQuery(question: string): Promise<QueryBuilderResponse> {
    try {
      // Create conversation with system prompt and user question
      const messages: Message[] = [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: question }
      ];
      
      // Generate Cypher query using LLM
      const response = await llmClient.generateText(messages, 0.2);
      
      // Extract Cypher from response
      const cypher = this.extractCypherQuery(response);
      
      // Validate the query
      const isValid = this.validateCypherQuery(cypher);
      
      // Extract explanation (text after the code block)
      // Modified regex to work without 's' flag
      const explanation = response.replace(/```(?:cypher)?\s*([\s\S]+?)```/, '').trim();
      
      return {
        cypher,
        explanation,
        isValid,
        error: isValid ? undefined : 'Generated query may not be valid Cypher'
      };
    } catch (error) {
      console.error('Error building query:', error);
      return {
        cypher: '',
        explanation: '',
        isValid: false,
        error: `Error generating query: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Test if the generated query is executable
   * 
   * @param cypher Cypher query to test
   * @returns Whether the query executed successfully
   */
  public async testQuery(cypher: string): Promise<boolean> {
    try {
      // Add LIMIT to avoid large result sets during testing
      let testCypher = cypher;
      if (!testCypher.includes('LIMIT')) {
        testCypher += ' LIMIT 5';
      }
      
      await neo4jClient.executeQuery(testCypher);
      return true;
    } catch (error) {
      console.error('Error testing query:', error);
      return false;
    }
  }
}

export default QueryBuilderAgent.getInstance(); 