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
4. If the answer is impossible, output exactly \`// NOT ANSWERABLE\`.

Cypher:`;

// ——— QA prompt (friendly answer + ONE follow-up)
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
• If results are empty, politely say you don't have that info.  
• **After your answer add exactly one line that starts with**  
  \`FollowUp:\` and contains one natural question the user might ask next.

Assistant:`;

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
      model: cfg.model || "gemini-flash-2.0-001",
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
    for (const [, lbl] of raw.matchAll(/:\s*([A-Z0-9_\-]+)/gi))
      this.nodeLabels.add(lbl);
    for (const [, rel] of raw.matchAll(/\[:([A-Z0-9_\-]+)\]/gi))
      this.relTypes.add(rel);
  }

  async refreshSchema() {
    if (!this.graph) throw new Error("Graph not initialised");
    this.schemaText = await this.graph.getSchema();
    this.parseSchema(this.schemaText);
  }
  async getSchema() {
    if (!this.schemaText) await this.refreshSchema();
    return this.schemaText;
  }

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
    
    // More lenient validation check - look for common Cypher keywords or patterns
    if (!/match|return|create|call|where|with|order by|limit|merge|set|case|when|optional|using|unwind/i.test(code)) {
      console.warn("Warning: Generated text may not be valid Cypher:", code);
      // Fallback to a simple Cypher query if nothing valid was generated
      return "MATCH (n) RETURN count(n) as nodeCount LIMIT 1";
    }
    return code;
  }

  /* =====================  NON-STREAM  ============================ */
  async query(userQ: string) {
    if (!this.chain) throw new Error("Service not initialised");
    const schema = await this.getSchema();
    const examples = await this.cypherFewShot.format({ question: userQ });

    /* -------- 1) generate Cypher -------- */
    const cypherPrompt = await PromptTemplate.fromTemplate(
      CYPHER_GENERATION_TEMPLATE
    ).format({ schema, question: userQ, examples });

    const cypherRaw = (await this.llm.invoke(cypherPrompt)).content.toString();
    const cypher = this.cleanCypher(cypherRaw);

    /* -------- 2) run query -------- */
    let result;
    try {
      result = await this.graph!.query(cypher);
    } catch (err) {
      result = [{ error: `Cypher error: ${(err as Error).message}` }];
    }

    /* -------- 3) answer prompt -------- */
    const qaPrompt = await PromptTemplate.fromTemplate(QA_TEMPLATE).format({
      schema,
      history: this.historyString(),
      question: userQ,
      query: cypher,
      result: JSON.stringify(result, null, 2),
    });

    const qa = (await this.llm.invoke(qaPrompt)).content.toString().trim();

    /* split answer / follow-up */
    const followRE = /^FollowUp:\s*(.+)$/im;
    const follow = qa.match(followRE)?.[1]?.trim() || null;
    const answer = qa.replace(followRE, "").trim();

    this.remember(userQ, answer);

    return { answer, followUp: follow, cypher };
  }

  /* ======================  STREAMING  ============================ */
  async streamQuery(userQ: string): Promise<ReadableStream<Uint8Array>> {
    if (!this.chain) throw new Error("Service not initialised");
    const schema = await this.getSchema();
    const examples = await this.cypherFewShot.format({ question: userQ });

    /* -------- generate & run Cypher -------- */
    const cypherPrompt = await PromptTemplate.fromTemplate(
      CYPHER_GENERATION_TEMPLATE
    ).format({ schema, question: userQ, examples });

    const cypherRaw = (await this.llm.invoke(cypherPrompt)).content.toString();
    const cypher = this.cleanCypher(cypherRaw);

    let result;
    try {
      result = await this.graph!.query(cypher);
    } catch (err) {
      result = [{ error: `Cypher error: ${(err as Error).message}` }];
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

    const chunk = this.streamChunk;
    const self = this; // capture for inner fn
    let fullResponse = "";
    
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Process the stream in chunks for smooth display
          for await (const part of llmStream) {
            const txt = typeof part.content === "string"
              ? part.content
              : JSON.stringify(part.content);
            
            fullResponse += txt;
            controller.enqueue(new TextEncoder().encode(txt));
            await new Promise((r) => setTimeout(r, 6));
          }
          
          // After the full response is collected, extract the follow-up question
          const followUpMatch = fullResponse.match(/FollowUp:\s*(.+?)(\n|$)/i);
          const follow = followUpMatch ? followUpMatch[1].trim() : null;
          
          // Only add the follow-up button if a question was found
          if (follow) {
            await new Promise((r) => setTimeout(r, 50));
            controller.enqueue(
              new TextEncoder().encode(`\n\n{{follow_up_question:${follow}}}`)
            );
          }
          
          // Remove the follow-up line from the response we store in history
          const answer = fullResponse.replace(/FollowUp:\s*(.+?)(\n|$)/i, "").trim();
          self.remember(userQ, answer);
          
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }
}
