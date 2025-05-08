"use client";

import { Chat } from "@/components/chat";
import ImprovedGraph from "@/components/graph/improvedgraph";
import { generateUUID } from "@/lib/utils";
import { useState, useEffect, useCallback, useMemo } from "react";

export default function Home() {
  const id = generateUUID();
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  
  // Extract unique relationship types for better query generation
  const uniqueRelationshipTypes = useMemo(() => {
    const types = graph.links.map((link) => link.type);
    return [...new Set(types)].filter(Boolean);
  }, [graph.links]);
  
  // Extract unique node labels
  const uniqueNodeLabels = useMemo(() => {
    // Handle different node structures safely
    const labels = graph.nodes
      .map((node) => {
        // Check if node has a labels property that is an array
        if (node.labels && Array.isArray(node.labels)) {
          return node.labels;
        }
        // Check if node has a label property
        if (node.label) {
          return [node.label];
        }
        // If node has neither, try to extract type information from other properties
        if (node.type) {
          return [node.type];
        }
        return [];
      })
      .flat();
    return [...new Set(labels)].filter(Boolean);
  }, [graph.nodes]);
  
  // Log unique relationship types and node labels 
  console.log("Available relationship types:", uniqueRelationshipTypes);
  console.log("Available node labels:", uniqueNodeLabels);
  
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
        <Chat 
          id={id} 
          onCypherQuery={updateCypherQuery} 
          graphMetadata={{
            relationshipTypes: uniqueRelationshipTypes,
            nodeCount: graph.nodes.length,
            nodeLabels: uniqueNodeLabels
          }} 
        />
      </div>
    </div>
  );
}