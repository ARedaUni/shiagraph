import llmClient, { Message } from '../ai/llmClient';

/**
 * Intent types that can be classified
 */
export enum QueryIntent {
  GRAPH_QUERY = 'GRAPH_QUERY',          // Query about the graph data
  GENERAL_QUESTION = 'GENERAL_QUESTION', // General conversation, not related to graph
  GRAPH_EXPLANATION = 'GRAPH_EXPLANATION', // Request to explain graph concepts/patterns
  VISUALIZATION_REQUEST = 'VISUALIZATION_REQUEST', // Request to modify visualization
  UNKNOWN = 'UNKNOWN'                    // Unclassifiable intent
}

/**
 * Response interface for Intent Classifier
 */
export interface IntentClassification {
  intent: QueryIntent;
  confidence: number; // 0-1 score indicating confidence
  explanation?: string;
  entities?: string[]; // Any specific entities mentioned in the query
}

/**
 * Intent Classifier Agent
 * 
 * This service is responsible for determining the user's intent from their
 * natural language query, specifically distinguishing between graph-related
 * queries and general questions.
 */
export class IntentClassifierAgent {
  private static instance: IntentClassifierAgent | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of IntentClassifierAgent
   */
  public static getInstance(): IntentClassifierAgent {
    if (!IntentClassifierAgent.instance) {
      IntentClassifierAgent.instance = new IntentClassifierAgent();
    }
    return IntentClassifierAgent.instance;
  }

  /**
   * Simple heuristic-based classification
   * This provides a fast first-pass classification without LLM overhead
   * 
   * @param query The user's query
   * @returns Classification of query intent based on heuristics
   */
  private heuristicClassification(query: string): IntentClassification | null {
    // Normalize query for matching
    const normalizedQuery = query.toLowerCase();
    
    // Graph-related keywords
    const graphKeywords = [
      'graph', 'node', 'connection', 'relationship', 'connected', 
      'network', 'linked', 'cluster', 'visualization', 'show me', 
      'search for', 'find', 'who knows', 'related to', 'path between',
      'visualization', 'display', 'map', 'diagram'
    ];
    
    // Graph explanation keywords
    const explanationKeywords = [
      'explain', 'what does', 'how does', 'interpret', 'meaning of',
      'understand', 'describe', 'clarify', 'elaborate on'
    ];
    
    // Visualization request keywords
    const visualizationKeywords = [
      'visualize', 'display', 'show', 'highlight', 'focus on', 'zoom',
      'filter', 'expand', 'color', 'resize', 'rearrange', 'layout'
    ];
    
    // Count keyword matches in each category
    const graphMatches = graphKeywords.filter(keyword => 
      normalizedQuery.includes(keyword)).length;
    
    const explanationMatches = explanationKeywords.filter(keyword => 
      normalizedQuery.includes(keyword)).length;
    
    const visualizationMatches = visualizationKeywords.filter(keyword => 
      normalizedQuery.includes(keyword)).length;
    
    // Determine confidence for each type
    const graphConfidence = graphMatches / graphKeywords.length;
    const explanationConfidence = explanationMatches / explanationKeywords.length;
    const visualizationConfidence = visualizationMatches / visualizationKeywords.length;
    
    // Extract potential entities (capitalized words or quoted terms)
    const entityRegex = /"([^"]+)"|'([^']+)'|([A-Z][a-zA-Z]+)/g;
    const matches = [...normalizedQuery.matchAll(entityRegex)];
    const entities = matches.map(match => match[1] || match[2] || match[0]).filter(Boolean);
    
    // Classify based on highest confidence
    if (visualizationConfidence > 0.1 && 
        visualizationConfidence >= graphConfidence && 
        visualizationConfidence >= explanationConfidence) {
      return {
        intent: QueryIntent.VISUALIZATION_REQUEST,
        confidence: visualizationConfidence,
        entities
      };
    } else if (explanationConfidence > 0.1 && 
              explanationConfidence >= graphConfidence) {
      return {
        intent: QueryIntent.GRAPH_EXPLANATION,
        confidence: explanationConfidence,
        entities
      };
    } else if (graphConfidence > 0.1) {
      return {
        intent: QueryIntent.GRAPH_QUERY,
        confidence: graphConfidence,
        entities
      };
    }
    
    // If no strong match, return null and let LLM decide
    return null;
  }

  /**
   * Classify the intent of a user query
   * 
   * @param query The user's query
   * @returns Classification of query intent
   */
  public async classifyIntent(query: string): Promise<IntentClassification> {
    // Try heuristic classification first for performance
    const heuristicResult = this.heuristicClassification(query);
    
    // If heuristic classification is confident, return it directly
    if (heuristicResult && heuristicResult.confidence > 0.3) {
      return heuristicResult;
    }
    
    try {
      // Prepare the prompt for LLM classification
      const systemPrompt = `You are an intent classification system for a graph visualization application. Your task is to determine if a user's query is:

1. GRAPH_QUERY - Related to retrieving or searching data in the knowledge graph
   Examples: "Find users from Canada", "Show me connections between AI and spirituality", "Who is connected to John?"

2. GRAPH_EXPLANATION - About explaining graph concepts or patterns
   Examples: "Explain what this cluster means", "Why are these nodes grouped together?", "What does this connection represent?"

3. VISUALIZATION_REQUEST - About modifying the graph visualization
   Examples: "Zoom in on this section", "Highlight all users from Canada", "Change the layout to force-directed"

4. GENERAL_QUESTION - A general question not directly related to the graph
   Examples: "What time is it?", "How does Neo4j work?", "Tell me about graph databases"

Respond with only the intent classification in ALL CAPS, followed by a confidence score (0-1), and optionally a brief explanation. Also extract any specific entities (people, locations, topics) mentioned in the query.

Format: 
INTENT_TYPE | confidence_score | brief_explanation | entity1, entity2, ...`;
      
      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ];
      
      // Generate classification
      const response = await llmClient.generateText(messages, 0.1); // Lower temperature for consistency
      
      // Parse the response
      const parts = response.split('|').map(part => part.trim());
      
      if (parts.length < 2) {
        // Fallback if response format is unexpected
        return {
          intent: response.includes('GRAPH') ? QueryIntent.GRAPH_QUERY : QueryIntent.GENERAL_QUESTION,
          confidence: 0.6,
          explanation: 'Based on limited classification data'
        };
      }
      
      // Extract the intent from the first part
      let intent: QueryIntent;
      const intentString = parts[0].toUpperCase();
      
      if (intentString.includes('GRAPH_QUERY')) {
        intent = QueryIntent.GRAPH_QUERY;
      } else if (intentString.includes('GRAPH_EXPLANATION')) {
        intent = QueryIntent.GRAPH_EXPLANATION;
      } else if (intentString.includes('VISUALIZATION_REQUEST')) {
        intent = QueryIntent.VISUALIZATION_REQUEST;
      } else if (intentString.includes('GENERAL_QUESTION')) {
        intent = QueryIntent.GENERAL_QUESTION;
      } else {
        intent = QueryIntent.UNKNOWN;
      }
      
      // Extract confidence score
      const confidenceMatch = parts[1].match(/(\d+\.\d+)/);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7;
      
      // Extract explanation
      const explanation = parts.length > 2 ? parts[2] : undefined;
      
      // Extract entities
      const entities = parts.length > 3 
        ? parts[3].split(',').map(e => e.trim()).filter(e => e.length > 0)
        : [];
      
      return {
        intent,
        confidence,
        explanation,
        entities
      };
    } catch (error) {
      console.error('Error classifying intent:', error);
      
      // Fallback to heuristic result or default to GENERAL_QUESTION
      return heuristicResult || {
        intent: QueryIntent.GENERAL_QUESTION,
        confidence: 0.5,
        explanation: 'Default classification due to processing error'
      };
    }
  }

  /**
   * Check if the query is graph-related
   * 
   * @param query The user's query
   * @returns Whether the query is related to the graph
   */
  public async isGraphRelated(query: string): Promise<boolean> {
    const classification = await this.classifyIntent(query);
    
    return classification.intent === QueryIntent.GRAPH_QUERY || 
           classification.intent === QueryIntent.GRAPH_EXPLANATION ||
           classification.intent === QueryIntent.VISUALIZATION_REQUEST;
  }
}

export default IntentClassifierAgent.getInstance(); 