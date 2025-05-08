"use client";

import { Chat } from "@/components/chat";
import ImprovedGraph from "@/components/graph/improvedgraph";
import { generateUUID } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";

export default function Home() {
  const id = generateUUID();
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numberOfNodes, setNumberOfNodes] = useState<number>(100);
  const [queryType, setQueryType] = useState<string>('default');
  const [cypher, setCypher] = useState<string | null>(null);

  // Function to fetch graph data
  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          limit: numberOfNodes, 
          queryType,
          cypher: cypher 
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setGraph({ nodes: data.nodes ?? [], links: data.links ?? [] });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setGraph({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, [numberOfNodes, queryType, cypher]);

  // Function to update cypher query from chat
  const updateCypherQuery = (query: string) => {
    setCypher(query);
  };

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  return (
    <div className="grid grid-cols-[1fr_400px] h-screen">
      <div className="overflow-hidden">
        <ImprovedGraph 
          graph={graph}
          loading={loading}
          error={error}
          numberOfNodes={numberOfNodes}
          setNumberOfNodes={setNumberOfNodes}
          queryType={queryType}
          setQueryType={setQueryType}
          refreshGraph={fetchGraph}
        />
      </div>
      <div className="border-l border-border overflow-hidden">
        <Chat id={id} onCypherQuery={updateCypherQuery} />
      </div>
    </div>
  );
}