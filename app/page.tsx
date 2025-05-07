import { Chat } from "@/components/chat";
import GraphViewer from "@/components/graph/graphviewer";
import { generateUUID } from "@/lib/utils";

export default function Home() {
  const id = generateUUID();
  return (
    <div className="grid grid-cols-[1fr_400px] h-[calc(100vh-8rem)]">
      <div className="overflow-hidden">
        <GraphViewer />
      </div>
      <div className="border-l border-border overflow-y-auto">
        <Chat id={id} />
      </div>
    </div>
  );
}