"use client";

import { ChatInput } from "@/components/chat-input";
import { Message } from "@/lib/types";
import { fillMessageParts, generateUUID } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import ChatMessage from "./chat-message";
import { queryLangChainGraph } from "@/lib/langchain-client";

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

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<Message[]>([id, "messages"], null, {
    fallbackData: [],
  });

  // Keep the latest messages in a ref.
  const messagesRef = useRef<Message[]>(messages || []);
  useEffect(() => {
    messagesRef.current = messages || [];
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

  return (
    <div className="flex flex-col w-full h-full relative">
      <ChatMessage 
        isLoading={isLoading} 
        messages={messages} 
        onFollowUpClick={(question) => {
          // Create a new message for the follow-up question
          const newMessage: Message = {
            id: generateUUID(),
            content: question,
            role: "user",
          };
          append(newMessage);
          
          // Process the follow-up question
          processInput(question);
        }}
      />

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