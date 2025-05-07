"use client";

import { cn } from "@/lib/utils";
import { ArrowUp, Square } from "lucide-react";
import { useRef, useState } from "react";
import Textarea from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { Message } from "@/lib/types";

interface ChatInputProps {
  chatId: string;
  userInput: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  messages: Message[] | undefined;
  appendAndTrigger: (message: Message) => Promise<void>;
}

export function ChatInput({
  chatId,
  userInput,
  handleInputChange,
  handleSubmit,
  isLoading,
  messages,
  appendAndTrigger,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false); // Composition state
  const [enterDisabled, setEnterDisabled] = useState(false); // Disable Enter after composition ends

  const handleCompositionStart = () => setIsComposing(true);

  const handleCompositionEnd = () => {
    setIsComposing(false);
    setEnterDisabled(true);
    setTimeout(() => {
      setEnterDisabled(false);
    }, 300);
  };

  return (
    <div
      className={cn(
        "w-full",
        messages !== undefined && messages.length > 0
          ? "absolute bottom-0 left-0 right-0 bg-background border-t"
          : "absolute bottom-4 left-0 right-0 top-6 flex flex-col items-center justify-center"
      )}
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          "w-full mx-auto",
          messages !== undefined && messages.length > 0 ? "px-2 py-2" : "px-3"
        )}
      >
        {messages === undefined ||
          (messages.length === 0 && (
            <div className="mb-6">
            </div>
          ))}
        <div className="relative flex flex-col w-full gap-2 bg-muted rounded-xl border border-input">
          <Textarea
            ref={inputRef}
            name="input"
            rows={1}
            maxRows={4}
            tabIndex={0}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="Ask a question..."
            spellCheck={false}
            value={userInput}
            className="resize-none w-full min-h-10 bg-transparent border-0 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => {
              handleInputChange(e);
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !isComposing &&
                !enterDisabled
              ) {
                if (userInput.trim().length === 0) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                const textarea = e.target as HTMLTextAreaElement;
                textarea.form?.requestSubmit();
              }
            }}
          />

          {/* Bottom menu area */}
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2"></div>
            <div className="flex items-center gap-2">
              <Button
                type={isLoading ? "button" : "submit"}
                size={"icon"}
                variant={"outline"}
                className={cn(isLoading && "animate-pulse", "rounded-full")}
                disabled={userInput.length === 0 && !isLoading}
                onClick={isLoading ? undefined : undefined}
              >
                {isLoading ? <Square size={18} /> : <ArrowUp size={18} />}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}