/**
 * LangChain-powered GraphRAG service
 * – deterministic Cypher
 * – 1 follow-up question (button only)
 * – in-memory conversation history            (no external DB)
 * – smooth streaming
 * – now escapes curly–brace Cypher literals   (fixes INVALID_PROMPT_INPUT)
 */
import { GraphCypherQAChain } from "@langchain/community/chains/graph_qa/cypher";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import {
  PromptTemplate,
  FewShotPromptTemplate,
} from "@langchain/core/prompts";
import { ReadableStream } from "stream/web";

/* ------------------------------------------------------------------ */
/* 1.  FEW-SHOT CYPHER EXAMPLES                                       */
/* ------------------------------------------------------------------ */
const CYPHER_EXAMPLES = [
  { question: "How many nodes are there?", query: "MATCH (n) RETURN count(n)" },
  {
    question: "What types of relationships exist in the database?",
    query:
      "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType",
  },
  {
    question: "Find all nodes with the Person label",
    query: "MATCH (p:Person) RETURN p.name, p.birthdate",
  },
  {
    question: "Who knows NextJS?",
    query: "MATCH (p:Person)-[:KNOWS_TECH]->(t:Technology {{name: 'NextJS'}}) RETURN p.name, p.expertise_level",
  },
  {
    question: "Who went to IIT?",
    query: "MATCH (p:Person)-[:STUDIED_AT]->(i:Institution {{name: 'IIT'}}) RETURN p.name, p.graduation_year ORDER BY p.graduation_year DESC",
  },
  {
    question: "Which people are connected to each other?",
    query:
      "MATCH (p1:Person)-[r]-(p2:Person) RETURN p1.name, type(r), p2.name",
  },
  {
    question: "Find people who are experts in GraphQL",
    query:
      "MATCH (p:Person)-[:KNOWS_TECH]->(t:Technology {{name: 'GraphQL'}}) WHERE p.expertise_level >= 4 RETURN p.name, p.expertise_level ORDER BY p.expertise_level DESC",
  },
  {
    question: "Who has worked with React for more than 5 years?",
    query:
      "MATCH (p:Person)-[r:KNOWS_TECH]->(t:Technology {{name: 'React'}}) WHERE r.years_experience > 5 RETURN p.name, r.years_experience ORDER BY r.years_experience DESC",
  },
  {
    question: "What are the properties of Person nodes?",
    query: "MATCH (p:Person) RETURN p.name, p.age, p.birthdate LIMIT 5",
  },
  {
    question: "Find people born after 1990",
    query:
      "MATCH (p:Person) WHERE p.birthdate.year > 1990 RETURN p.name, p.birthdate ORDER BY p.birthdate",
  },
  {
    question: "Who has the most connections in the network?",
    query:
      "MATCH (p:Person)-[r]-() RETURN p.name, count(r) AS connections ORDER BY connections DESC LIMIT 1",
  },
  {
    question: "Find the shortest path between two people",
    /*  IMPORTANT:  the inner braces are doubled  →  {{  }}
        to prevent PromptTemplate from treating them as variables.   */
    query:
      "MATCH path = shortestPath((p1:Person {{name: 'Person A'}})-[*]-(p2:Person {{name: 'Person B'}})) RETURN path",
  },
  {
    question: "Who worked at Google and knows Python?",
    query:
      "MATCH (p:Person)-[:WORKED_AT]->(c:Company {{name: 'Google'}}), (p)-[:KNOWS_TECH]->(t:Technology {{name: 'Python'}}) RETURN p.name, p.job_title",
  },
  {
    question: "Who are the top 5 people with the most diverse skills?",
    query:
      "MATCH (p:Person)-[:KNOWS_TECH]->(t:Technology) RETURN p.name, count(distinct t) AS num_skills ORDER BY num_skills DESC LIMIT 5",
  },
  {
    question: "Who is from India?",
    query:
      "MATCH (p:Person)-[r]->(c:Country) WHERE c.name = 'India' OR toLower(c.name) = 'india' RETURN p.name LIMIT 10",
  },
  {
    question: "Find people's countries of origin",
    query:
      "MATCH (p:Person)-[r]->(c:Country) RETURN p.name, c.name as country ORDER BY p.name LIMIT 20",
  },
  {
    question: "Who is from the USA?",
    query:
      "MATCH (p:Person)-[r]->(c) WHERE c.name IN ['USA', 'United States', 'US', 'America'] OR (c:Country AND any(label IN labels(c) WHERE label CONTAINS 'USA' OR label CONTAINS 'United')) RETURN p.name LIMIT 10",
  }
];

/* ------------------------------------------------------------------ */
/* 2.  PROMPT TEMPLATES                                               */
/* ------------------------------------------------------------------ */

// ——— Cypher generation prompt
const CYPHER_GENERATION_TEMPLATE = `You are an expert Neo4j Cypher query generator.

DATABASE SCHEMA:
{schema}

PREVIOUS EXAMPLES:
{examples}

CURRENT QUESTION:
{question}

RULES
1. **Return only raw Cypher – no markdown fences, no comments.**
2. Use labels / relationships that exist in the schema.
3. Add LIMIT when the result set could be large.
4. If the answer requires information not in the schema or is impossible to answer with the graph, output exactly \`// NOT ANSWERABLE\`.
5. Be strict about what's in the schema - if the schema doesn't explicitly show information required to answer, use \`// NOT ANSWERABLE\`.
6. When looking for relationships between nodes, be flexible with relationship types - use pattern matching like "-[r]->", not just specific relationship types.
7. For questions about people's origins, countries, or locations, try different patterns like:
   - MATCH (p:Person)-[r]->(c:Country)
   - MATCH (p:Person)-[r]->(c) WHERE c:Country OR any(label in labels(c) WHERE label CONTAINS 'Country')
   - Use case-insensitive comparisons WHERE toLower(c.name) = 'countryname'

Cypher:
`;

// ——— QA prompt (friendly answer, no follow-up)
const QA_TEMPLATE = `You are a helpful assistant chatting about people & organisations.

GRAPH SCHEMA:
{schema}

PREVIOUS CONVERSATION (you = Assistant)
{history}

USER QUESTION:
{question}

CYPHER RUN:
{query}

RESULTS:
{result}

IN YOUR RESPONSE
• Answer plainly (don't mention Cypher / nodes / relationships).  
• If results are empty, say you don't have that specific information in your database.
• Don't apologize excessively when you don't have information - just be clear about what you do and don't know.
• Be concise and directly answer the question when possible.

A:`;

/* ------------------------------------------------------------------ */
/* 3.  CLASS                                                          */
/* ------------------------------------------------------------------ */
interface LangChainGraphConfig {
  url: string;
  username: string;
  password: string;
  model?: string;
  streamChunkSize?: number;
}

type Exchange = { user: string; assistant: string };

// Global cached schema to persist between requests
let globalSchemaCache = "";
let lastSchemaRefresh = 0;
const SCHEMA_CACHE_TTL = 1000 * 60 * 10; // 10 minutes in milliseconds

export class LangChainGraph {
  private graph: Neo4jGraph | null = null;
  private llm: ChatGoogleGenerativeAI;
  private chain: GraphCypherQAChain | null = null;
  private cypherFewShot: FewShotPromptTemplate;
  private streamChunk = 12;

  /* simple in-process memory (last 6 exchanges) */
  private history: Exchange[] = [];

  /* cached schema (+ label / rel sets for quick validation) */
  private schemaText = "";
  private nodeLabels = new Set<string>();
  private relTypes = new Set<string>();

  constructor(private readonly cfg: LangChainGraphConfig) {
    this.llm = new ChatGoogleGenerativeAI({
      model: cfg.model || "gemini-flash-2.0-lite-001",
      temperature: 0,
      maxOutputTokens: 2048,
    });
    if (cfg.streamChunkSize) this.streamChunk = cfg.streamChunkSize;

    /* -------------- FEW-SHOT TEMPLATE (uses standard format) -------------- */
    this.cypherFewShot = new FewShotPromptTemplate({
      examples: CYPHER_EXAMPLES,
      examplePrompt: new PromptTemplate({
        template: "Question: {question}\nCypher: {query}",
        inputVariables: ["question", "query"],
      }),
      prefix: "You are an expert Neo4j Cypher query generator. Below are examples of questions and the Cypher queries that answer them:\n\n",
      suffix: "\nQuestion: {question}\n\nGenerate a valid Cypher query to answer this question. Your response must start with MATCH, CALL, or another valid Cypher keyword:\n",
      inputVariables: ["question"],
    });
  }

  /* --------------------------- INIT ------------------------------ */
  async initialize(): Promise<void> {
    this.graph = await Neo4jGraph.initialize({
      url: this.cfg.url,
      username: this.cfg.username,
      password: this.cfg.password,
    });

    await this.refreshSchema();

    this.chain = GraphCypherQAChain.fromLLM({
      llm: this.llm,
      graph: this.graph,
      cypherPrompt: PromptTemplate.fromTemplate(CYPHER_GENERATION_TEMPLATE),
      qaPrompt: PromptTemplate.fromTemplate(QA_TEMPLATE),
    });

    console.log("LangChain Graph initialised ✅");
  }

  /* ------------------------- SCHEMA ------------------------------ */
  private parseSchema(raw: string) {
    this.nodeLabels.clear();
    this.relTypes.clear();
    
    // Extract node labels (more robust pattern)
    for (const [, lbl] of raw.matchAll(/:\s*([A-Z0-9_\-]+)/gi)) {
      this.nodeLabels.add(lbl);
    }
    
    // Extract relationship types with improved pattern matching
    // Handle various formats like [:REL_TYPE], -[:REL_TYPE]->, [:rel_type], etc.
    const relPatterns = [
      /\[:([A-Z0-9_\-]+)\]/gi,                // Basic [:REL]
      /-\[:([A-Z0-9_\-]+)\]->/gi,             // Direction -[:REL]->
      /<-\[:([A-Z0-9_\-]+)\]-/gi,             // Direction <-[:REL]-
      /\(:.*?\)-\[(:|\s)*([A-Z0-9_\-]+)(:|\s)*\]-/gi, // More complex pattern
      /\(:.*?\)-\[.*?:([A-Z0-9_\-]+).*?\]-/gi // Most flexible pattern
    ];
    
    for (const pattern of relPatterns) {
      for (const match of raw.matchAll(pattern)) {
        // The match index depends on the pattern's capture group position
        const relType = match[1] || match[2];
        if (relType) this.relTypes.add(relType);
      }
    }
    
    // Log what we found for debugging
    console.log("Detected node labels:", Array.from(this.nodeLabels));
    console.log("Detected relationship types:", Array.from(this.relTypes));
  }

  async refreshSchema() {
    if (!this.graph) throw new Error("Graph not initialised");
    
    const now = Date.now();
    
    // Check if global cache is still valid
    if (globalSchemaCache && now - lastSchemaRefresh < SCHEMA_CACHE_TTL) {
      console.log("Using cached schema (global cache)");
      this.schemaText = globalSchemaCache;
      this.parseSchema(this.schemaText);
      return;
    }
    
    console.log("Fetching fresh schema from database");
    this.schemaText = await this.graph.getSchema();
    
    // If schema doesn't explicitly show relationships, do a direct query
    if (!this.schemaText.includes("[:") || !this.schemaText.match(/\[.*?:.*?\]/)) {
      console.log("Schema lacks relationship details, enhancing with direct query");
      try {
        // Direct query to get all relationship types
        const relTypesResult = await this.graph.query(
          "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType"
        );
        
        // Format and add to schema
        if (relTypesResult && Array.isArray(relTypesResult) && relTypesResult.length > 0) {
          const relTypes = relTypesResult.map(r => r.relationshipType).join(', ');
          this.schemaText += `\n\nRelationship Types: ${relTypes}`;
        }
        
        // Get a sample of each relationship with connecting node labels
        const sampleRelsResult = await this.graph.query(`
          MATCH (a)-[r]->(b) 
          WITH type(r) AS relType, labels(a) AS sourceLabels, labels(b) AS targetLabels, count(*) AS cnt
          RETURN relType, sourceLabels, targetLabels, cnt 
          ORDER BY cnt DESC
          LIMIT 20
        `);
        
        if (sampleRelsResult && Array.isArray(sampleRelsResult) && sampleRelsResult.length > 0) {
          this.schemaText += "\n\nRelationship Patterns:";
          for (const rel of sampleRelsResult) {
            const sourceLabel = rel.sourceLabels[0] || 'Node';
            const targetLabel = rel.targetLabels[0] || 'Node';
            this.schemaText += `\n(${sourceLabel})-[:${rel.relType}]->(${targetLabel})`;
          }
        }
      } catch (err) {
        console.error("Error enhancing schema with relationship info:", err);
      }
    }
    
    this.parseSchema(this.schemaText);
    
    // Update global cache
    globalSchemaCache = this.schemaText;
    lastSchemaRefresh = now;
  }
  
  async getSchema() {
    if (!this.schemaText) await this.refreshSchema();
    return this.schemaText;
  }

  /* --------------------- QUERY EVALUATION ------------------------ */
  // Removing the shouldQueryGraph method completely

  /* ---------------------- MEMORY HELPERS ------------------------- */
  private historyString() {
    if (this.history.length === 0) return "None";
    return this.history
      .slice(-6)
      .map((e) => `User: ${e.user}\nAssistant: ${e.assistant}`)
      .join("\n\n");
  }
  private remember(user: string, assistant: string) {
    this.history.push({ user, assistant });
  }

  /* ----------------------- UTILITIES ----------------------------- */
  private cleanCypher(raw: string) {
    // Remove code fences if present
    const code = raw.replace(/```(?:cypher)?/gi, "").replace(/```/g, "").trim();
    
    // Check for explicit "not answerable" marker
    if (code.includes("NOT ANSWERABLE")) {
      console.log("Query explicitly marked as not answerable by LLM");
      return null;
    }
    
    // More lenient validation check - look for common Cypher keywords or patterns
    if (!/match|return|create|call|where|with|order by|limit|merge|set|case|when|optional|using|unwind/i.test(code)) {
      console.warn("Warning: Generated text may not be valid Cypher:", code);
      return null;
    }
    return code;
  }

  /* -------------------- GENERAL RESPONSE ------------------------- */
  private async generateGeneralResponse(userQ: string): Promise<{answer: string}> {
    const generalPrompt = `
You are a helpful assistant chatting about people & organisations.

PREVIOUS CONVERSATION (you = Assistant)
${this.historyString()}

USER QUESTION:
${userQ}

Provide a brief, helpful response. If the question might be related to specific data that you don't have access to, politely explain that you don't have that information.

Response:`;

    const response = (await this.llm.invoke(generalPrompt)).content.toString().trim();
    
    this.remember(userQ, response);
    
    return { answer: response };
  }

  /* ====================== CORE QUERY LOGIC ======================== */
  private async processQuery(userQ: string): Promise<{
    answer: string; 
    cypher?: string;
    isGraphResponse: boolean;
  }> {
    if (!this.chain) throw new Error("Service not initialised");
    
    // Removed the shouldQueryGraph evaluation code
    
    const schema = await this.getSchema();
    const examples = await this.cypherFewShot.format({ question: userQ });

    /* -------- 1) generate Cypher -------- */
    const cypherPrompt = await PromptTemplate.fromTemplate(
      CYPHER_GENERATION_TEMPLATE
    ).format({ schema, question: userQ, examples });

    const cypherRaw = (await this.llm.invoke(cypherPrompt)).content.toString();
    const cypher = this.cleanCypher(cypherRaw);
    
    // If no valid Cypher was generated, fall back to general response
    if (!cypher) {
      console.log(`Could not generate valid Cypher for "${userQ}", falling back to general response`);
      const { answer } = await this.generateGeneralResponse(userQ);
      return { answer, isGraphResponse: false };
    }
    
    // Log the generated Cypher query
    console.log(`Generated Cypher for "${userQ}":\n${cypher}`);

    /* -------- 2) run query -------- */
    let result;
    try {
      result = await this.graph!.query(cypher);
      
      // If the result is empty, consider using general knowledge
      if (Array.isArray(result) && result.length === 0) {
        console.log(`Empty results for "${userQ}", considering general response`);
      }
      
    } catch (err) {
      console.error(`Cypher execution error: ${(err as Error).message}`);
      const { answer } = await this.generateGeneralResponse(userQ);
      return { answer, isGraphResponse: false };
    }

    /* -------- 3) answer prompt -------- */
    const qaPrompt = await PromptTemplate.fromTemplate(QA_TEMPLATE).format({
      schema,
      history: this.historyString(),
      question: userQ,
      query: cypher,
      result: JSON.stringify(result, null, 2),
    });

    const answer = (await this.llm.invoke(qaPrompt)).content.toString().trim();

    this.remember(userQ, answer);

    return { answer, cypher, isGraphResponse: true };
  }

  /* =====================  NON-STREAM  ============================ */
  async query(userQ: string) {
    const result = await this.processQuery(userQ);
    return {
      answer: result.answer,
      cypher: result.cypher
    };
  }

  /* ======================  STREAMING  ============================ */
  async streamQuery(userQ: string): Promise<ReadableStream<Uint8Array>> {
    const result = await this.processQuery(userQ);
    
    return new ReadableStream<Uint8Array>({
      start(controller) {
        // Send the answer
        controller.enqueue(new TextEncoder().encode(result.answer));
        controller.close();
      }
    });
  }

  /* ======================  STREAMING WITH LLM  ========================= */
  async streamQueryWithLLM(userQ: string): Promise<ReadableStream<Uint8Array>> {
    if (!this.chain) throw new Error("Service not initialised");
    
    // Proceed with graph-based streaming logic using LLM
    const schema = await this.getSchema();
    const examples = await this.cypherFewShot.format({ question: userQ });

    /* -------- generate & run Cypher -------- */
    const cypherPrompt = await PromptTemplate.fromTemplate(
      CYPHER_GENERATION_TEMPLATE
    ).format({ schema, question: userQ, examples });

    const cypherRaw = (await this.llm.invoke(cypherPrompt)).content.toString();
    const cypher = this.cleanCypher(cypherRaw);
    
    if (!cypher) {
      return this.streamQuery(userQ);
    }
    
    let result;
    try {
      result = await this.graph!.query(cypher);
    } catch (err) {
      return this.streamQuery(userQ);
    }

    /* -------- build QA prompt -------- */
    const qaPrompt = await PromptTemplate.fromTemplate(QA_TEMPLATE).format({
      schema,
      history: this.historyString(),
      question: userQ,
      query: cypher,
      result: JSON.stringify(result, null, 2),
    });

    /* -------- LLM stream -------- */
    const llmStream = await this.llm.stream(qaPrompt);

    const self = this; // capture for inner fn
    let fullResponse = "";
    
    return new ReadableStream({
      async start(controller) {
        try {
          // Process the stream chunks from LLM
          for await (const part of llmStream) {
            const txt = typeof part.content === "string"
              ? part.content
              : JSON.stringify(part.content);
            
            fullResponse += txt;
            // Send the chunk to the client
            controller.enqueue(new TextEncoder().encode(txt));
            
            // Small delay to improve UI rendering (optional)
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          // Store the completed response in history
          self.remember(userQ, fullResponse.trim());
          
          controller.close();
        } catch (err) {
          console.error("Error in LLM stream processing:", err);
          controller.error(err);
        }
      }
    });
  }
}
