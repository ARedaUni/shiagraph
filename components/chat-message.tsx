"use client";

import React, { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import CodeDisplayBlock from "@/components/code-display";
import { marked } from "marked";
import { Message } from "@/lib/types";
import { AILogo, UserIcon } from "./ui/icons";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";

interface ChatMessageProps {
  messages: Message[] | undefined;
  isLoading: boolean;
}

export default function ChatMessage({ messages, isLoading }: ChatMessageProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (messages === undefined || messages.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto overflow-x-hidden pb-16" style={{ height: "calc(100% - 80px)" }}>
        <div className="flex flex-col h-full justify-center items-center">
          <div className="text-center text-muted-foreground">Ask a question to start the conversation</div>
        </div>
      </div>
    );
  }

  const copyResponseToClipboard = (code: string, messageId: number) => {
    navigator.clipboard.writeText(code);
    setCopiedMessageId(messageId);
    toast.success("Code copied to clipboard!");
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 1500);
  };

  return (
    <div
      id="scroller"
      className="w-full overflow-y-auto overflow-x-hidden h-full pb-16"
      style={{ height: "calc(100% - 80px)" }}
    >
      <div className="w-full flex flex-col overflow-x-hidden pt-4 px-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-col gap-2 p-3 whitespace-pre-wrap",
              message.role === "user" ? "items-end" : "items-start"
            )}
          >
            <div className="flex gap-2 items-center">
              {message.role === "user" && (
                <div className="flex items-end w-full gap-2">
                  <span
                    className="bg-accent p-2 rounded-md w-full max-w-xs overflow-x-auto text-sm"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(message.content),
                    }}
                  />

                  <Avatar className="flex justify-center items-center overflow-hidden w-8 h-8 rounded-full bg-gray-700">
                    <UserIcon />
                  </Avatar>
                </div>
              )}

              {message.role === "assistant" && (
                <div className="flex items-end gap-2">
                  <Avatar className="flex justify-center items-center overflow-hidden w-8 h-8 rounded-full bg-gray-700">
                    <AILogo
                      className="object-contain"
                      width={24}
                      height={24}
                    />
                  </Avatar>

                  <span className="p-2 rounded-md max-w-xs overflow-x-auto text-sm">
                    {/* Check if the message content contains a code block */}
                    {message.content.split("```").map((part, index) => {
                      if (index % 2 === 0) {
                        return (
                          <span
                            key={index}
                            dangerouslySetInnerHTML={{
                              __html: marked.parse(part),
                            }}
                          />
                        );
                      } else {
                        return (
                          <pre className="whitespace-pre-wrap text-xs" key={index}>
                            <CodeDisplayBlock code={part} lang="" />
                          </pre>
                        );
                      }
                    })}

                    {isLoading &&
                      messages.indexOf(message) === messages.length - 1 && (
                        <span className="animate-pulse" aria-label="Typing">
                          ...
                        </span>
                      )}

                    {/* Copy button inside the response container */}
                    {!isLoading && (
                      <Button
                        onClick={() =>
                          copyResponseToClipboard(message.content, index)
                        }
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                      >
                        {copiedMessageId === index ? (
                          <CheckIcon className="w-3 h-3 scale-100 transition-all" />
                        ) : (
                          <CopyIcon className="w-3 h-3 scale-100 transition-all" />
                        )}
                      </Button>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex pl-3 pb-3 gap-2 items-center">
            <div className="bg-accent p-2 rounded-md max-w-xs overflow-x-auto">
              <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-slate-700 motion-safe:animate-[bounce_1s_ease-in-out_infinite] dark:bg-slate-300"></span>
                <span className="size-1.5 rounded-full bg-slate-700 motion-safe:animate-[bounce_0.5s_ease-in-out_infinite] dark:bg-slate-300"></span>
                <span className="size-1.5 rounded-full bg-slate-700 motion-safe:animate-[bounce_1s_ease-in-out_infinite] dark:bg-slate-300"></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div id="anchor" ref={bottomRef} className="h-4"></div>
    </div>
  );
}