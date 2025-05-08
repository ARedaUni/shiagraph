"use client";

import { ChatInput } from "@/components/chat-input";
import { Message } from "@/lib/types";
import { fillMessageParts, generateUUID } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import ChatMessage from "./chat-message";
import { streamChat } from "@/lib/clients";

interface ChatProps {
  id: string;
  onCypherQuery?: (query: string) => void;
}

export function Chat({ id, onCypherQuery }: ChatProps) {
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

  // Append function
  const appendAndTrigger = useCallback(
    async (message: Message): Promise<void> => {
      const inputContent: string = message.content;
      await append(message);
      
      // Check if the message contains a Cypher query and pass it to parent if needed
      if (onCypherQuery && inputContent.toLowerCase().includes('cypher:')) {
        // Extract the Cypher query (assuming it comes after "cypher:")
        const query = inputContent.substring(inputContent.toLowerCase().indexOf('cypher:') + 7).trim();
        if (query) {
          onCypherQuery(query);
        }
      }
      
      await streamChat({ inputContent, setIsLoading, append });
    },
    [setIsLoading, append, onCypherQuery]
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

      // Check if the message contains a Cypher query and pass it to parent if needed
      if (onCypherQuery && inputContent.toLowerCase().includes('cypher:')) {
        // Extract the Cypher query (assuming it comes after "cypher:")
        const query = inputContent.substring(inputContent.toLowerCase().indexOf('cypher:') + 7).trim();
        if (query) {
          onCypherQuery(query);
        }
      }

      setInputContent("");

      await streamChat({ inputContent, setIsLoading, append });
    },
    [inputContent, setInputContent, setIsLoading, append, onCypherQuery]
  );

  // handle form submission functionality
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(e);
  };

  return (
    <div className="flex flex-col w-full h-full relative">
      <ChatMessage isLoading={isLoading} messages={messages} />

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