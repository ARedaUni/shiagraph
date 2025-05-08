import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

/**
 * Types for LLM interactions
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/**
 * AI Client Service
 * 
 * Provides a unified interface for interacting with Large Language Models (LLMs).
 * Currently supports Google's Gemini models, but can be extended to other providers.
 */
export class LLMClient {
  private static instance: LLMClient | null = null;
  private provider: any;
  private model: string;
  private apiKey: string;

  private constructor() {
    // Get API key from environment variables
    this.apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable');
    }

    // Default to Gemini 2.0 Flash (fast, high quality)
    this.model = process.env.LLM_MODEL || 'gemini-2.0-flash-001';
    
    // Initialize the AI provider
    this.provider = google(this.model, {
      safetySettings: [
        { 
          category: 'HARM_CATEGORY_HATE_SPEECH', 
          threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
        },
        { 
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT', 
          threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
        },
        { 
          category: 'HARM_CATEGORY_HARASSMENT', 
          threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
        },
        { 
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 
          threshold: 'BLOCK_MEDIUM_AND_ABOVE' 
        },
      ],
    });
  }

  /**
   * Get the singleton instance of LLMClient
   */
  public static getInstance(): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient();
    }
    return LLMClient.instance;
  }

  /**
   * Generate text based on provided messages in a non-streaming fashion
   *
   * @param messages Array of message objects representing the conversation
   * @param temperature Controls randomness (0 = deterministic, 1 = creative)
   * @returns Generated text
   */
  public async generateText(messages: Message[], temperature: number = 0.3): Promise<string> {
    try {
      const completion = await this.provider.complete({
        messages,
        temperature,
        maxTokens: 2048,
      });

      return completion.text;
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }

  /**
   * Stream text generation, providing incremental updates
   *
   * @param messages Array of message objects representing the conversation
   * @param callbacks Object containing callback functions for token updates and completion
   * @param temperature Controls randomness (0 = deterministic, 1 = creative)
   */
  public async streamGenerateText(
    messages: Message[],
    callbacks: StreamCallbacks = {},
    temperature: number = 0.3
  ): Promise<void> {
    try {
      const result = await streamText({
        model: this.provider,
        messages,
        temperature,
        maxTokens: 2048,
        providerOptions: {
          google: {
            responseModalities: ['TEXT'],
          }
        }
      });

      let fullResponse = '';
      
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        callbacks.onToken?.(chunk);
      }
      
      callbacks.onComplete?.(fullResponse);
    } catch (error) {
      console.error('Error streaming text:', error);
      callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Create a conversation with a system prompt and user message
   *
   * @param systemPrompt Instructions for the AI assistant
   * @param userMessage The user's input message
   * @returns Array of messages ready for LLM processing
   */
  public createConversation(systemPrompt: string, userMessage: string): Message[] {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
  }

  /**
   * Extract specific patterns from generated text
   * Useful for parsing structured data from LLM responses
   *
   * @param text Text to extract patterns from
   * @param pattern Regex pattern for extraction
   * @returns Array of matches or null if no matches
   */
  public extractPattern(text: string, pattern: RegExp): RegExpExecArray | null {
    return pattern.exec(text);
  }
}

export default LLMClient.getInstance(); 