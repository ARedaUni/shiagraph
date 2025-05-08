import llmClient, { Message } from '../ai/llmClient';
import { GraphQueryResult } from '../graph/retriever';

/**
 * Response interface for Graph Summarizer
 */
export interface GraphSummaryResponse {
  summary: string;
  keyInsights: string[];
  visualizationTips?: string[];
  error?: string;
}

/**
 * Graph Summarizer Agent
 * 
 * This service is responsible for analyzing graph data and providing
 * human-readable insights and summaries about the structure and patterns.
 */
export class GraphSummarizerAgent {
  private static instance: GraphSummarizerAgent | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of GraphSummarizerAgent
   */
  public static getInstance(): GraphSummarizerAgent {
    if (!GraphSummarizerAgent.instance) {
      GraphSummarizerAgent.instance = new GraphSummarizerAgent();
    }
    return GraphSummarizerAgent.instance;
  }

  /**
   * Create a system prompt for graph summarization
   * 
   * @param graphData The graph data to summarize
   * @param query Original user query that led to this graph
   * @returns System prompt for the LLM
   */
  private createSystemPrompt(graphData: GraphQueryResult, query: string): string {
    // Calculate basic graph metrics
    const nodeCount = graphData.nodes.length;
    const linkCount = graphData.links.length;
    
    // Get node types (labels) from the graph
    const nodeTypes = new Set<string>();
    graphData.nodes.forEach(node => {
      if (node.label) {
        nodeTypes.add(node.label);
      }
    });
    
    // Get relationship types from the graph
    const relationshipTypes = new Set<string>();
    graphData.links.forEach(link => {
      if (link.type) {
        relationshipTypes.add(link.type);
      }
    });
    
    return `You are an expert in graph analytics and data visualization. Your task is to analyze the provided graph data and create a concise, insightful summary that helps the user understand patterns and relationships.

USER QUERY: "${query}"

GRAPH METRICS:
- Nodes: ${nodeCount}
- Relationships: ${linkCount}
- Node types: ${Array.from(nodeTypes).join(', ')}
- Relationship types: ${Array.from(relationshipTypes).join(', ')}

GRAPH DATA:
${JSON.stringify(graphData, null, 2).substring(0, 4000)}

Please analyze this graph and provide:
1. A concise summary (2-3 sentences) describing what the graph shows
2. 3-5 key insights or patterns visible in the data
3. Optional tips for how to interpret the visualization

Focus on the most interesting patterns, central nodes, and meaningful relationships. Keep your response concise and informative.`;
  }

  /**
   * Extract key insights from LLM response
   * 
   * @param response The LLM's response text
   * @returns Array of extracted insights
   */
  private extractInsights(response: string): string[] {
    // Look for numbered lists, bullet points, or sections labeled "insights"
    const insightPatterns = [
      /(?:Key Insights|Insights|Patterns|Key Patterns):([\s\S]*?)(?:\n\n|$)/i,
      /(?:\d+\.\s+(.*?)(?=\d+\.\s+|$))/g,
      /(?:•\s+(.*?)(?=•\s+|$))/g,
      /(?:-\s+(.*?)(?=-\s+|$))/g
    ];
    
    // Try each pattern
    for (const pattern of insightPatterns) {
      const matches = response.match(pattern);
      if (matches && matches.length) {
        return matches
          .map(m => m.replace(/^\d+\.\s+|•\s+|-\s+|Key Insights:|Insights:|Patterns:|Key Patterns:/, '').trim())
          .filter(m => m.length > 0);
      }
    }
    
    // Fallback: Split by newlines and filter out short lines
    const lines = response.split('\n');
    return lines
      .filter(line => line.trim().length > 30) // Only reasonably long lines
      .map(line => line.trim())
      .slice(0, 5); // Take at most 5 insights
  }

  /**
   * Summarize graph data into human-readable insights
   * 
   * @param graphData The graph data to summarize
   * @param query Original user query that led to this graph
   * @returns Summary and insights about the graph
   */
  public async summarizeGraph(graphData: GraphQueryResult, query: string): Promise<GraphSummaryResponse> {
    try {
      // Handle empty graphs
      if (graphData.nodes.length === 0) {
        return {
          summary: "The query didn't return any results.",
          keyInsights: ["No data was found for the given query."],
          visualizationTips: []
        };
      }
      
      // Create conversation with system prompt
      const messages: Message[] = [
        { role: 'system', content: this.createSystemPrompt(graphData, query) },
        { role: 'user', content: "Please analyze this graph data and provide a summary and key insights." }
      ];
      
      // Generate summary using LLM
      const response = await llmClient.generateText(messages, 0.3);
      
      // Extract key sections
      // Look for a Summary section
      const summaryMatch = response.match(/(?:Summary|Overview):([\s\S]*?)(?:\n\n|$)/i);
      const summary = summaryMatch 
        ? summaryMatch[1].trim() 
        : response.split('\n')[0]; // Fall back to first line
      
      // Extract key insights
      const keyInsights = this.extractInsights(response);
      
      // Look for visualization tips
      const tipsMatch = response.match(/(?:Visualization Tips|Tips|Interpretation):([\s\S]*?)(?:\n\n|$)/i);
      const visualizationTips = tipsMatch 
        ? tipsMatch[1].split('\n').map(line => line.trim()).filter(line => line.length > 0)
        : [];
      
      return {
        summary,
        keyInsights,
        visualizationTips
      };
    } catch (error) {
      console.error('Error summarizing graph:', error);
      return {
        summary: "Error generating graph summary.",
        keyInsights: [],
        error: `Error summarizing graph: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create a narrative describing the relationship between two entities
   * 
   * @param graphData Graph data showing the relationship(s)
   * @param sourceEntity Source entity name
   * @param targetEntity Target entity name
   * @returns Narrative description of the relationship
   */
  public async describeRelationship(
    graphData: GraphQueryResult, 
    sourceEntity: string, 
    targetEntity: string
  ): Promise<string> {
    try {
      const prompt = `You are analyzing a graph showing relationships between "${sourceEntity}" and "${targetEntity}".
      
Graph data: 
${JSON.stringify(graphData, null, 2).substring(0, 4000)}

Please provide a concise narrative (2-3 sentences) describing how these entities are connected based on the graph data. Focus on the path between them and any interesting intermediary nodes.`;
      
      const messages: Message[] = [
        { role: 'system', content: prompt },
        { role: 'user', content: `Describe the relationship between ${sourceEntity} and ${targetEntity} based on this graph.` }
      ];
      
      const response = await llmClient.generateText(messages, 0.3);
      return response;
    } catch (error) {
      console.error('Error describing relationship:', error);
      return `Could not analyze the relationship between ${sourceEntity} and ${targetEntity}.`;
    }
  }

  /**
   * Recommend follow-up questions based on the current graph
   * 
   * @param graphData Current graph data
   * @param originalQuery User's original query
   * @returns Array of suggested follow-up questions
   */
  public async suggestFollowUpQuestions(
    graphData: GraphQueryResult,
    originalQuery: string
  ): Promise<string[]> {
    try {
      const prompt = `You are a graph analytics expert. Based on the following graph data and the user's original query, suggest 3 follow-up questions that would help the user explore the data further.

Original query: "${originalQuery}"

Graph data summary:
- ${graphData.nodes.length} nodes
- ${graphData.links.length} relationships
- Node types: ${Array.from(new Set(graphData.nodes.map(n => n.label))).join(', ')}
- Sample nodes: ${graphData.nodes.slice(0, 3).map(n => n.name || n.id).join(', ')}

Suggest specific, interesting follow-up questions that:
1. Explore different aspects of this data
2. Dig deeper into patterns or anomalies
3. Connect to related topics that might be of interest`;
      
      const messages: Message[] = [
        { role: 'system', content: prompt },
        { role: 'user', content: "Suggest follow-up questions based on this graph data." }
      ];
      
      const response = await llmClient.generateText(messages, 0.4);
      
      // Extract questions from response (look for numbered list or questions marks)
      const questions = response
        .split('\n')
        .filter(line => line.includes('?') || /^\d+\./.test(line))
        .map(line => line.replace(/^\d+\.\s+/, '').trim())
        .filter(line => line.length > 10);
      
      return questions.length > 0 ? questions : [response];
    } catch (error) {
      console.error('Error suggesting follow-up questions:', error);
      return ["Error generating follow-up questions."];
    }
  }
}

export default GraphSummarizerAgent.getInstance(); 