"use client";

import { ChatInput } from "@/components/chat-input";
import { Message } from "@/lib/types";
import { fillMessageParts, generateUUID } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import ChatMessage from "./chat-message";
import { queryLangChainGraph } from "@/lib/langchain-client";

// Suggestion button component with animated border effect
const SuggestionButton = ({ text, onClick }: { text: string; onClick: () => void }) => {
  return (
    <button 
      onClick={onClick}
      className="p-2 rounded-md overflow-hidden relative w-full cursor-pointer"
    >
      <div className="px-4 py-3 bg-white dark:bg-gray-800 rounded-md shadow-sm overflow-hidden">
        <div className="loading-border"></div>
        <span className="text-sm font-medium">{text}</span>
      </div>
      <style jsx>{`
        .loading-border {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 0.375rem;
          border: 4px solid transparent;
          background: linear-gradient(white, white) padding-box,
                      linear-gradient(90deg, #4F46E5, transparent, #A855F7, transparent, #4F46E5) border-box;
          background-size: 300% 100%;
          animation: border-spin 3s linear infinite;
          pointer-events: none;
          z-index: -1;
        }
        
        @keyframes border-spin {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 300% 0%;
          }
        }
        
        @media (prefers-color-scheme: dark) {
          .loading-border {
            background: linear-gradient(#1f2937, #1f2937) padding-box,
                        linear-gradient(90deg, #4F46E5, transparent, #A855F7, transparent, #4F46E5) border-box;
            background-size: 300% 100%;
          }
        }
      `}</style>
    </button>
  );
};

interface ChatProps {
  id: string;
  onCypherQuery?: (query: string) => void;
  graphMetadata?: {
    relationshipTypes: string[];
    nodeCount: number;
    nodeLabels?: string[];
  };
}

export function Chat({ id, onCypherQuery, graphMetadata }: ChatProps) {
  // Input state and handlers.
  const initialInput = "";
  const [inputContent, setInputContent] = useState<string>(initialInput);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // State to track if suggestions have been clicked
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  
  // Add ref for message container
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<Message[]>([id, "messages"], null, {
    fallbackData: [],
  });

  // Suggestions for the quick buttons
  const suggestions = [
    "What countries are people from?",
    "Find most connected nodes",
    "Show all relationship types",
    "Identify key communities"
  ];

  // Keep the latest messages in a ref.
  const messagesRef = useRef<Message[]>(messages || []);
  useEffect(() => {
    messagesRef.current = messages || [];
  }, [messages]);

  // Hide suggestions when there's at least one message
  useEffect(() => {
    if (messages && messages.length > 0) {
      setSuggestionsVisible(false);
    }
  }, [messages]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const setMessages = useCallback(
    (messages: Message[] | ((messages: Message[]) => Message[])) => {
      if (typeof messages === "function") {
        messages = messages(messagesRef.current);
      }

      const messagesWithParts = fillMessageParts(messages);
      mutate(messagesWithParts, false);
      messagesRef.current = messagesWithParts;
    },
    [mutate]
  );

  // Append function
  const append = useCallback(
    async (message: Message) => {
      return new Promise<string | null | undefined>((resolve) => {
        setMessages((draft) => {
          const lastMessage = draft[draft.length - 1];

          if (
            lastMessage?.role === "assistant" &&
            message.role === "assistant"
          ) {
            // Don't just append content, replace it to avoid possible duplication
            // This ensures we're using the exact content from the message
            const updatedMessage = {
              ...lastMessage,
              content: message.content,
            };

            resolve(updatedMessage.content); // Resolve with the updated content
            return [...draft.slice(0, -1), updatedMessage];
          } else {
            // Add a new message
            resolve(message.content); // Resolve with the new content
            return [...draft, message];
          }
        });
      });
    },
    [setMessages]
  );

  // Process user input - Using LangChain implementation
  const processInput = useCallback(
    async (input: string) => {
      // Use LangChain Graph API with streaming
      await queryLangChainGraph({ 
        question: input, 
        setIsLoading, 
        append, 
        graphMetadata,
        useStreaming: true // Enable streaming
      });
      
      // Handle cypher query extraction if needed (for graph visualization)
      if (onCypherQuery && input.toLowerCase().includes('cypher:')) {
        // Extract the Cypher query (assuming it comes after "cypher:")
        const query = input.substring(input.toLowerCase().indexOf('cypher:') + 7).trim();
        if (query) {
          onCypherQuery(query);
        }
      }
    },
    [setIsLoading, append, onCypherQuery, graphMetadata]
  );

  // Append function
  const appendAndTrigger = useCallback(
    async (message: Message): Promise<void> => {
      await append(message);
      await processInput(message.content);
    },
    [append, processInput]
  );

  // handlers
  const handleInputChange = (e: any) => {
    setInputContent(e.target.value);
  };

  const handleSubmit = useCallback(
    async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();

      if (!inputContent) return;

      const newMessage: Message = {
        id: generateUUID(),
        content: inputContent,
        role: "user",
      };
      append(newMessage);
      setInputContent("");

      await processInput(inputContent);
    },
    [inputContent, setInputContent, append, processInput]
  );

  // handle form submission functionality
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(e);
  };

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const newMessage: Message = {
        id: generateUUID(),
        content: suggestion,
        role: "user",
      };
      append(newMessage);
      processInput(suggestion);
      setSuggestionsVisible(false);
    },
    [append, processInput]
  );

  return (
    <div className="flex flex-col w-full h-full relative">
      <ChatMessage 
        isLoading={isLoading} 
        messages={messages} 
      />
      
      {/* Invisible div at the end for scrolling */}
      <div ref={messagesEndRef} />

      {/* Suggestion buttons - shown only when no messages and not loading */}
      {suggestionsVisible && !isLoading && (
        <div className="px-4 py-4 grid grid-cols-2 gap-3 mb-2">
          {suggestions.map((suggestion, index) => (
            <SuggestionButton 
              key={index} 
              text={suggestion} 
              onClick={() => handleSuggestionClick(suggestion)} 
            />
          ))}
        </div>
      )}

      <ChatInput
        chatId={id}
        userInput={inputContent}
        handleInputChange={handleInputChange}
        handleSubmit={onSubmit}
        isLoading={isLoading}
        messages={messages}
        appendAndTrigger={appendAndTrigger}
      />
    </div>
  );
}