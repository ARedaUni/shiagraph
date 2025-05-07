import { Chat } from "@/components/chat";
import ImprovedGraph from "@/components/graph/improvedgraph";
import { generateUUID } from "@/lib/utils";

export default function Home() {
  const id = generateUUID();
  return (
    <div className="grid grid-cols-[1fr_400px] h-[calc(100vh-8rem)]">
      <div className="overflow-hidden">
        <ImprovedGraph />
      </div>
      <div className="border-l border-border overflow-y-auto">
        <Chat id={id} />
      </div>
    </div>
  );
}