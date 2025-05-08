import { GraphCypherQAChain } from "langchain/chains/graph_qa/cypher";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { PromptTemplate, FewShotPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { ReadableStream } from "stream/web";
import { SemanticSimilarityExampleSelector } from "@langchain/core/example_selectors";

// Cypher examples for few-shot learning
const CYPHER_EXAMPLES = [
  {
    question: "How many nodes are there?",
    query: "MATCH (n) RETURN count(n)",
  },
  {
    question: "What types of relationships exist in the database?",
    query: "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType",
  },
  {
    question: "Find all nodes with the Person label",
    query: "MATCH (p:Person) RETURN p.name, p.birthdate",
  },
  {
    question: "Which people are connected to each other?",
    query: "MATCH (p1:Person)-[r]-(p2:Person) RETURN p1.name, type(r), p2.name",
  },
  {
    question: "Find nodes with the most relationships",
    query: "MATCH (n)-[r]->() RETURN n, count(r) as rel_count ORDER BY rel_count DESC LIMIT 5",
  },
  {
    question: "What are the properties of Person nodes?",
    query: "MATCH (p:Person) RETURN p.name, p.age, p.birthdate LIMIT 5",
  }
];

// Enhanced example prompt for better Cypher query generation
const CYPHER_GENERATION_TEMPLATE = `You are an expert in converting natural language into Cypher queries for Neo4j.

Below is the schema of the graph database:
{schema}

Your task is to generate a Cypher query that answers the given question.
Make sure to use appropriate labels and relationship types from the schema.

For nodes with labels, use the syntax (n:Label).
For relationships, use the syntax -[r:RELATIONSHIP_TYPE]-> with the proper direction.

When matching patterns, focus on finding patterns that connect relevant nodes
to answer the user's question effectively.

IMPORTANT: Return ONLY the raw Cypher query without any markdown formatting, code blocks, or explanations.

{examples}

Question: {question}

Cypher query:`;

// Enhanced template for answering the question
const QA_TEMPLATE = `You are an assistant that helps users understand information from a Neo4j graph database.

Below is the schema of the graph database:
{schema}

Question: {question}

I ran the following Cypher query to find the answer:
{query}

The query returned the following results:
{result}

Based on the graph database results, provide a comprehensive, natural language answer to the question.
If the results are empty or there was a query error, explain that no data was found that matches their query and suggest they try a different question or rephrase their query.
If you need to list items, format them in a natural, conversational way.
Include relevant details from the results to make your answer informative.
After your answer, suggest 2-3 related follow-up questions the user might want to ask.`;

// Types for the class
interface LangChainGraphConfig {
  url: string;
  username: string;
  password: string;
  model?: string;
}

export class LangChainGraph {
  private graph: Neo4jGraph | null = null;
  private model: ChatGoogleGenerativeAI;
  private config: LangChainGraphConfig;
  private chain: GraphCypherQAChain | null = null;
  private cypherPromptTemplate: FewShotPromptTemplate | null = null;
  private exampleSelector: SemanticSimilarityExampleSelector | null = null;

  constructor(config: LangChainGraphConfig) {
    this.config = config;
    this.model = new ChatGoogleGenerativeAI({
      model: config.model || "gemini-flash-2.0-001",
      temperature: 0,
    });
  }

  async initialize(): Promise<void> {
    try {
      this.graph = await Neo4jGraph.initialize({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
      });
      
      await this.refreshSchema();
      
      // Set up example selector for dynamic few-shot examples
      // If using embeddings, uncomment this section and add embedding model
      // this.exampleSelector = await SemanticSimilarityExampleSelector.fromExamples(
      //   CYPHER_EXAMPLES,
      //   new OpenAIEmbeddings(), // Replace with your embedding model
      //   { k: 3, inputKeys: ["question"] }
      // );
      
      // Create the few-shot prompt template
      const examplePrompt = PromptTemplate.fromTemplate(
        "User input: {question}\nCypher query (raw, without markdown): {query}"
      );
      
      this.cypherPromptTemplate = new FewShotPromptTemplate({
        examples: CYPHER_EXAMPLES,
        examplePrompt,
        prefix: "Here are some examples of questions and their corresponding raw Cypher queries (without any markdown formatting):",
        suffix: "\nUser input: {question}\nCypher query (without markdown):",
        inputVariables: ["question"],
      });
      
      // Initialize the GraphCypherQAChain with custom prompts
      this.chain = GraphCypherQAChain.fromLLM({
        llm: this.model,
        graph: this.graph,
        cypherPrompt: PromptTemplate.fromTemplate(CYPHER_GENERATION_TEMPLATE),
        qaPrompt: PromptTemplate.fromTemplate(QA_TEMPLATE),
      });
      
      console.log("LangChain Graph service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize LangChain Graph service:", error);
      throw error;
    }
  }

  async refreshSchema(): Promise<void> {
    if (!this.graph) {
      throw new Error("Graph is not initialized");
    }
    await this.graph.refreshSchema();
  }

  async getSchema(): Promise<string> {
    if (!this.graph) {
      throw new Error("Graph is not initialized");
    }
    return this.graph.getSchema();
  }
  
  // Helper method to clean Cypher queries from markdown formatting
  private cleanCypherQuery(query: string): string {
    // Remove markdown code block formatting if present
    const markdownMatch = query.match(/```(?:cypher)?\s*([\s\S]*?)```/i);
    if (markdownMatch && markdownMatch[1]) {
      return markdownMatch[1].trim();
    }
    return query.trim();
  }

  async streamQuery(question: string): Promise<ReadableStream<Uint8Array>> {
    if (!this.chain || !this.graph) {
      throw new Error("Chain or graph is not initialized");
    }
    
    // First, generate the Cypher query (non-streaming)
    const schema = await this.getSchema();
    
    // Generate examples for few-shot prompting
    const examplesContent = await this.cypherPromptTemplate?.format({ question }) || "";
    
    // Format the Cypher generation prompt with schema, examples, and question
    const cypherTemplate = PromptTemplate.fromTemplate(CYPHER_GENERATION_TEMPLATE);
    const cypherPrompt = await cypherTemplate.format({ 
      schema, 
      question,
      examples: examplesContent
    });
    
    const cypherResult = await this.model.invoke(cypherPrompt);
    // Clean the cypher query before using it
    const cypherQuery = this.cleanCypherQuery(cypherResult.content.toString());
    
    console.log("Generated Cypher query:", cypherQuery);

    // Execute the query against Neo4j
    let results;
    try {
      results = await this.graph.query(cypherQuery);
    } catch (error) {
      console.error("Error executing Cypher query:", error);
      console.error("Problematic query:", cypherQuery);
      results = [];
    }
    
    // Format the QA prompt with the results
    const qaTemplate = PromptTemplate.fromTemplate(QA_TEMPLATE);
    const qaPrompt = await qaTemplate.format({
      schema,
      question,
      query: cypherQuery,
      result: JSON.stringify(results, null, 2),
    });
    
    // Create a streaming response from the LLM
    const stream = await this.model.stream(qaPrompt);
    
    // Convert the LangChain stream to a ReadableStream
    return new ReadableStream({
      async start(controller) {
        try {
          let followupText = '';
          for await (const chunk of stream) {
            // Handle different content types
            const text = typeof chunk.content === 'string' 
              ? chunk.content 
              : Array.isArray(chunk.content) 
                ? chunk.content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join('') 
                : JSON.stringify(chunk.content);
            
            controller.enqueue(new TextEncoder().encode(text));
            followupText += text;
          }
          
          // Extract follow-up questions for future use
          // You could add a header with extracted follow-up questions
          // But that would require custom handling on the client
          
          controller.close();
        } catch (error) {
          console.error("Error in stream:", error);
          controller.error(error);
        }
      },
    });
  }

  async query(question: string): Promise<{ 
    result: string;
    query?: string; 
    followupQuestions?: string[];
  }> {
    if (!this.chain || !this.graph) {
      throw new Error("Chain or graph is not initialized");
    }

    try {
      // Get schema and format examples for few-shot learning
      const schema = await this.getSchema();
      const examplesContent = await this.cypherPromptTemplate?.format({ question }) || "";
      
      // Create a custom chain with few-shot examples
      const generateCypherQuery = async () => {
        const cypherTemplate = PromptTemplate.fromTemplate(CYPHER_GENERATION_TEMPLATE);
        const cypherPrompt = await cypherTemplate.format({ 
          schema, 
          question,
          examples: examplesContent
        });
        
        const cypherResult = await this.model.invoke(cypherPrompt);
        // Clean the cypher query before returning it
        return this.cleanCypherQuery(cypherResult.content.toString());
      };
      
      // Generate Cypher query
      const cypherQuery = await generateCypherQuery();
      console.log("Generated Cypher query:", cypherQuery);
      
      // Execute query and get results
      let results;
      try {
        results = await this.graph.query(cypherQuery);
      } catch (error) {
        console.error("Error executing Cypher query:", error);
        console.error("Problematic query:", cypherQuery);
        results = [];
      }
      
      // Format QA prompt and get answer
      const qaTemplate = PromptTemplate.fromTemplate(QA_TEMPLATE);
      const qaPrompt = await qaTemplate.format({
        schema,
        question,
        query: cypherQuery,
        result: JSON.stringify(results, null, 2),
      });
      
      const qaResult = await this.model.invoke(qaPrompt);
      const result = qaResult.content.toString().trim();
      
      // Extract follow-up questions (if any)
      const followupRegex = /follow-up questions?:?\s*((?:(?:\d+\.\s*|[-•]\s*).*\n?)+)/i;
      const followupMatch = result.match(followupRegex);
      
      let followupQuestions: string[] = [];
      if (followupMatch && followupMatch[1]) {
        followupQuestions = followupMatch[1]
          .split(/\n/)
          .map(q => q.replace(/^\d+\.\s*|[-•]\s*/, '').trim())
          .filter(q => q.length > 0);
        
        // Remove the follow-up questions from the result
        const cleanResult = result.replace(followupRegex, '').trim();
        
        return {
          result: cleanResult,
          query: cypherQuery,
          followupQuestions
        };
      }

      return {
        result: result,
        query: cypherQuery
      };
    } catch (error) {
      console.error("Error in graph query:", error);
      throw error;
    }
  }

  async directCypherQuery(cypher: string): Promise<any> {
    if (!this.graph) {
      throw new Error("Graph is not initialized");
    }
    return await this.graph.query(cypher);
  }
} 