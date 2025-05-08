import llmClient, { Message } from '../ai/llmClient';
import { queryBuilder, graphSummarizer, intentClassifier, QueryIntent } from '../agents';
import graphRetriever, { GraphQueryResult } from './retriever';

/**
 * GraphRAG Response interface
 */
export interface GraphRAGResponse {
  text: string;           // Text response to the user
  graphData?: GraphQueryResult; // Graph data for visualization
  generatedQuery?: string;      // The Cypher query that was generated
  followUpQuestions?: string[]; // Suggested follow-up questions
  error?: string;               // Error message if any
}

/**
 * GraphRAG Service
 * 
 * This service integrates the various components of the system into a coherent
 * Graph Retrieval-Augmented Generation (GraphRAG) pipeline. It coordinates:
 * 1. Intent classification of user queries
 * 2. Query building to convert natural language to Cypher
 * 3. Graph retrieval from Neo4j
 * 4. Graph summarization to provide human-readable insights
 * 5. Response generation using the LLM
 */
export class GraphRAG {
  private static instance: GraphRAG | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of GraphRAG
   */
  public static getInstance(): GraphRAG {
    if (!GraphRAG.instance) {
      GraphRAG.instance = new GraphRAG();
    }
    return GraphRAG.instance;
  }

  /**
   * Process a user query through the GraphRAG pipeline
   * 
   * @param query The user's natural language query
   * @param graphMetadata Optional metadata about the graph to help with query generation
   * @returns Response with text and graph data
   */
  public async processQuery(
    query: string, 
    graphMetadata?: { 
      relationshipTypes: string[],
      nodeCount: number,
      nodeLabels?: string[]
    }
  ): Promise<GraphRAGResponse> {
    try {
      // Step 1: Classify the intent of the query
      const classification = await intentClassifier.classifyIntent(query);
      
      // Handle non-graph queries with the general LLM
      if (classification.intent === QueryIntent.GENERAL_QUESTION) {
        const response = await this.handleGeneralQuestion(query);
        return {
          text: response,
          // No graph data for general questions
        };
      }
      
      // Handle graph explanation requests
      if (classification.intent === QueryIntent.GRAPH_EXPLANATION) {
        // This would typically require existing graph context from the UI
        // For this implementation, we'll generate a general explanation
        return {
          text: "To provide a specific explanation of the graph visualization, I need to know which part you're asking about. You can ask about specific nodes, relationships, or patterns you see."
        };
      }
      
      // Handle visualization requests
      if (classification.intent === QueryIntent.VISUALIZATION_REQUEST) {
        return {
          text: "I've received your visualization request. The frontend will handle adjustments to the graph display. You can specify what you'd like to focus on or how you'd like to filter the visualization."
        };
      }
      
      // Step 2: Generate a Cypher query from the natural language
      const queryResult = await queryBuilder.buildQuery(query, graphMetadata);
      
      if (!queryResult.isValid || !queryResult.cypher) {
        return {
          text: "I couldn't generate a valid query from your question. Could you rephrase it?",
          error: queryResult.error || "Failed to generate a valid Cypher query"
        };
      }
      
      // Step 3: Execute the query to retrieve graph data
      let graphData: GraphQueryResult;
      try {
        graphData = await graphRetriever.executeQuery(queryResult.cypher);
      } catch (error) {
        console.error('Error executing query:', error);
        return {
          text: "I encountered an error while querying the graph database. The query syntax might be incorrect.",
          generatedQuery: queryResult.cypher,
          error: `Error executing query: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      
      // If no results were found, provide a clear message
      if (graphData.nodes.length === 0) {
        return {
          text: `I couldn't find any results matching your query about "${query}".`,
          graphData,
          generatedQuery: queryResult.cypher
        };
      }
      
      // Step 4: Format the response based on the graph data
      let responseText = '';
      
      // Special case for single-node queries like "who is X"
      if (graphData.nodes.length === 1 && graphData.links.length === 0 && 
          (query.toLowerCase().includes('who is') || query.toLowerCase().includes('who\'s'))) {
        const node = graphData.nodes[0];
        responseText = `${node.name || node.id} is a ${node.label || 'person'} in the database.`;
        
        // Add node properties in a natural way
        if (node.properties) {
          const properties = Object.entries(node.properties);
          if (properties.length > 0) {
            responseText += "\n\n";
            for (const [key, value] of properties) {
              // Format key as readable text (e.g., "user_id" -> "User ID")
              const readableKey = key
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
              
              responseText += `${readableKey}: ${value}\n`;
            }
          }
        }
      } 
      // For multiple people (common case)
      else if (graphData.nodes.length > 0 && 
               graphData.nodes.every(node => node.label === 'Person' || node.label === 'user' || node.label === 'DiscordUser')) {
        const nodeNames = graphData.nodes.map(node => node.name || node.id);
        
        if (nodeNames.length <= 2) {
          responseText = `I found ${nodeNames.join(' and ')}.`;
        } else {
          const lastPerson = nodeNames.pop();
          responseText = `I found ${nodeNames.join(', ')}, and ${lastPerson}.`;
        }
      }
      // Default case: use the graph summarizer
      else {
        // Get a summary from the graph summarizer
        const summary = await graphSummarizer.summarizeGraph(graphData, query);
        responseText = summary.summary;
        
        // Add key insights if they're meaningful
        if (summary.keyInsights && summary.keyInsights.length > 0) {
          responseText += '\n\n' + summary.keyInsights.map(insight => `• ${insight}`).join('\n');
        }
      }
      
      // Step 5: Generate follow-up questions
      let followUpQuestions = await graphSummarizer.suggestFollowUpQuestions(graphData, query);
      
      // Clean up follow-up questions - remove any explanations (text after periods, dashes, or parentheses)
      if (followUpQuestions && followUpQuestions.length > 0) {
        followUpQuestions = followUpQuestions.map(q => q.split(/[.(]/, 1)[0].trim());
      }
      
      return {
        text: responseText,
        graphData,
        generatedQuery: queryResult.cypher,
        followUpQuestions
      };
    } catch (error) {
      console.error('Error in GraphRAG pipeline:', error);
      return {
        text: "I encountered an error while processing your query.",
        error: `GraphRAG pipeline error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle general questions that don't require graph data
   * 
   * @param query The user's general question
   * @returns Text response
   */
  private async handleGeneralQuestion(query: string): Promise<string> {
    const systemPrompt = `You are an assistant for a knowledge graph visualization application. 
The user has asked a general question that doesn't require accessing the graph database.
Answer based on your general knowledge, but feel free to suggest how the graph could be used if relevant.`;
    
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];
    
    try {
      const response = await llmClient.generateText(messages);
      return response;
    } catch (error) {
      console.error('Error handling general question:', error);
      return "I'm sorry, I encountered an error while processing your question. Could you try again?";
    }
  }

  /**
   * Process a query specifically about relationships between entities
   * 
   * @param sourceEntity First entity to find relationship for
   * @param targetEntity Second entity to find relationship for
   * @param maxDepth Maximum path length to consider
   * @returns Response with text and graph data showing the relationship
   */
  public async findRelationship(
    sourceEntity: string, 
    targetEntity: string, 
    maxDepth: number = 3
  ): Promise<GraphRAGResponse> {
    try {
      // Retrieve the graph data showing relationships
      const graphData = await graphRetriever.getShortestPath(sourceEntity, targetEntity, maxDepth);
      
      if (graphData.nodes.length === 0) {
        return {
          text: `I couldn't find any connection between ${sourceEntity} and ${targetEntity} within ${maxDepth} steps.`,
          graphData: { nodes: [], links: [], executedQuery: graphData.executedQuery }
        };
      }
      
      // Generate a narrative description of the relationship
      const relationshipDescription = await graphSummarizer.describeRelationship(
        graphData, 
        sourceEntity, 
        targetEntity
      );
      
      return {
        text: relationshipDescription,
        graphData,
        followUpQuestions: [
          `What other entities are connected to ${sourceEntity}?`,
          `Tell me more about ${targetEntity}.`,
          `What's the strongest connection in this network?`
        ]
      };
    } catch (error) {
      console.error('Error finding relationship:', error);
      return {
        text: `I encountered an error while finding the relationship between ${sourceEntity} and ${targetEntity}.`,
        error: `Error finding relationship: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Find entities by keywords or topics
   * 
   * @param keywords Array of keywords to search for
   * @param limit Maximum number of results
   * @returns Response with text and graph data containing relevant entities
   */
  public async findByKeywords(keywords: string[], limit: number = 50): Promise<GraphRAGResponse> {
    try {
      if (!keywords.length) {
        return {
          text: "Please provide some keywords to search for in the graph.",
          error: "No keywords provided"
        };
      }
      
      // Retrieve subgraph based on keywords
      const graphData = await graphRetriever.getThematicSubgraph(keywords, limit);
      
      if (graphData.nodes.length === 0) {
        return {
          text: `I couldn't find any entities matching the keywords: ${keywords.join(', ')}.`,
          graphData: { nodes: [], links: [], executedQuery: graphData.executedQuery }
        };
      }
      
      // Summarize the results
      const summary = await graphSummarizer.summarizeGraph(
        graphData, 
        `Find entities related to: ${keywords.join(', ')}`
      );
      
      return {
        text: summary.summary,
        graphData,
        followUpQuestions: [
          `What connections exist between these entities?`,
          `Which of these entities has the most relationships?`,
          `Tell me more about ${graphData.nodes[0]?.name || 'the main entity'}.`
        ]
      };
    } catch (error) {
      console.error('Error finding by keywords:', error);
      return {
        text: `I encountered an error while searching for entities with keywords: ${keywords.join(', ')}.`,
        error: `Error finding by keywords: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

export default GraphRAG.getInstance(); 