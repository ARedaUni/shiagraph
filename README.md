# ShiaGraph - Knowledge Graph Visualization with AI

## Overview

ShiaGraph is an application for visualizing and interacting with a knowledge graph of a Discord server through natural language. The system combines graph visualization with AI-powered querying capabilities, allowing users to explore complex relationships through conversation.

## Architecture

### Core Components

The application follows a modular architecture centered around Graph Retrieval-Augmented Generation (Graph RAG):

1. **Frontend**
   - Chat interface for natural language interaction
   - Interactive graph visualization for displaying relationships
   - Seamless updates as queries modify the displayed graph

2. **Agent System**
   - Query Builder Agent: Converts natural language to Cypher queries
   - Graph Summarizer Agent: Analyzes graph data to provide human-readable insights
   - Intent classifier to route requests appropriately

3. **Graph RAG Implementation**
   - Extracts relevant subgraphs based on user questions
   - Uses subgraphs as context for AI responses
   - Generates accurate, graph-informed answers

4. **Backend Services**
   ```
   /services
     /agents
       - queryBuilder.ts (Converts natural language to Cypher)
       - graphSummarizer.ts (Analyzes graph data for insights)
       - intentClassifier.ts (Determines query intent)
     /graph
       - client.ts (Neo4j connection and query execution)
       - retriever.ts (Extracts relevant subgraphs)
       - graphRAG.ts (Integrates agents and retrieval)
     /ai
       - llmClient.ts (Abstraction over Gemini/other models)
   ```

5. **API Structure**
   ```
   /api
     /chat
       /stream - Main chat endpoint
     /graph
       /query - Execute Cypher directly
       /rag - Extract subgraph and return with summary
   ```

## User Flow

1. User asks a question (e.g., "Who is from Canada?")
2. The system determines if the question relates to graph data
3. For graph-related questions:
   - Query Builder converts the question to a Cypher query
   - Graph Retriever executes the query against Neo4j
   - Summarizer enriches the response with insights from the graph
   - The UI updates to display both the text response and visualization
4. For general questions:
   - The regular LLM handles the response

## Extensibility

This architecture supports future extensions like:
- Multiple knowledge sources
- Different reasoning agents
- Advanced visualization modes
- User-defined graph queries
- Custom graph algorithms

## Implementation Progress

### Completed Components

- ✅ Service directory structure created
- ✅ Neo4j client service implemented (services/graph/client.ts)
- ✅ Graph retriever service implemented (services/graph/retriever.ts)
- ✅ LLM client abstraction created (services/ai/llmClient.ts)
- ✅ Query Builder agent implemented (services/agents/queryBuilder.ts)
- ✅ Graph Summarizer agent implemented (services/agents/graphSummarizer.ts)
- ✅ Intent Classifier implemented (services/agents/intentClassifier.ts)
- ✅ GraphRAG service implemented (services/graph/graphRAG.ts)

### In Progress

- 🔄 API layer refactoring

### Pending

- Frontend integration
- Testing and optimization

## Implementation Roadmap

### Phase 1: Service Layer Setup ✅

1. **Create Service Directory Structure** ✅
   ```bash
   mkdir -p services/agents services/graph services/ai
   ```

2. **Setup Neo4j Client** ✅
   - Create `services/graph/client.ts` for Neo4j connection management
   - Implement connection pooling and query execution functions
   - Add environment variables for Neo4j credentials

3. **Create LLM Client Abstraction** ✅
   - Implement `services/ai/llmClient.ts` to abstract Google Gemini API
   - Add configuration for different models/providers
   - Include streaming response functionality

### Phase 2: Agent Implementation ✅

1. **Implement Query Builder Agent** ✅
   - Create `services/agents/queryBuilder.ts`
   - Define system prompts for Cypher generation
   - Add validation of generated Cypher queries
   - Include error handling for malformed queries

2. **Implement Graph Summarizer Agent** ✅
   - Create `services/agents/graphSummarizer.ts`
   - Build prompt templates that incorporate graph structure
   - Implement result formatting and content extraction

3. **Create Intent Classifier** ✅
   - Implement simple heuristics or ML-based classifier
   - Determine if a query is graph-related or general

### Phase 3: Graph RAG Integration ✅

1. **Build Graph Retriever** ✅
   - Create `services/graph/retriever.ts`
   - Implement subgraph extraction based on query context
   - Add functions to convert Neo4j results to structured data

2. **Create RAG Pipeline** ✅
   - Combine agents, retriever, and LLM in a coherent pipeline
   - Implement proper context windows and prompt engineering
   - Create `services/graph/graphRAG.ts` to integrate all components

### Phase 4: API Layer Refactoring

1. **Refactor Chat API**
   - Update `app/api/chat/stream/route.ts` to use the new service layer
   - Implement proper streaming of combined results
   - Add error handling and fallback strategies

2. **Implement Graph API Endpoints**
   - Create `/api/graph/query` for direct Cypher execution
   - Implement `/api/graph/rag` for the complete RAG pipeline
   - Add appropriate authentication and rate limiting

### Phase 5: Frontend Integration

1. **Update Chat Component**
   - Modify `components/chat.tsx` to handle graph-specific responses
   - Add UI indicators for when graph queries are being processed

2. **Enhance Graph Visualization**
   - Update integration between chat responses and graph updates
   - Add animations for graph transitions
   - Implement highlighting of relevant nodes/edges

### Phase 6: Testing and Optimization

1. **Unit and Integration Tests**
   - Write tests for individual agents and the RAG pipeline
   - Create end-to-end tests for the complete user flow

2. **Performance Optimization**
   - Profile and optimize Neo4j queries
   - Implement caching layers for repeated queries
   - Add loading indicators and progressive rendering

## Getting Started

(Development and deployment instructions to be added)

## Technologies

- Next.js
- Neo4j
- Google Generative AI (Gemini)
- D3.js for graph visualization
