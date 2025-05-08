export { default as neo4jClient } from './client';
export { default as graphRetriever } from './retriever';
export type { GraphQueryResult } from './retriever';
export { default as graphRAG } from './graphRAG';
export type { GraphRAGResponse } from './graphRAG';

/**
 * Graph Service
 * 
 * This module exports all graph-related services that can be used to interact
 * with the knowledge graph:
 * 
 * - neo4jClient: Low-level Neo4j database connection and query execution
 * - graphRetriever: Extract relevant subgraphs from the knowledge graph
 * - graphRAG: Integration of graph retrieval with AI for question answering
 */ 