/**
 * Services Module
 * 
 * This is the main entry point for all services used in the ShiaGraph application.
 * It re-exports all services from their respective modules for easy importing.
 */

// AI Services
export { default as llmClient } from './ai/llmClient';
export type { Message } from './ai/llmClient';

// Graph Services
export { 
  neo4jClient,
  graphRetriever,
  graphRAG
} from './graph';
export type { GraphQueryResult, GraphRAGResponse } from './graph';

// Agent Services
export { 
  queryBuilder,
  graphSummarizer,
  intentClassifier,
  QueryIntent
} from './agents';
export type { 
  QueryBuilderResponse,
  GraphSummaryResponse,
  IntentClassification
} from './agents';

/**
 * Usage example:
 * 
 * ```typescript
 * import { graphRAG, neo4jClient } from '../services';
 * 
 * // Process a natural language query
 * const result = await graphRAG.processQuery('Who is from Canada?');
 * ```
 */ 