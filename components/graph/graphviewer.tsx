'use client'
import { Loader } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import GraphCanvas from "./graphcanvas";

/* ---------- GraphViewer (UI + fetching) ----------------------------------*/
export default function GraphViewer() {
    const [graph, setGraph] = useState<any>({ nodes: [], links: [] });
    const [relTypes, setRelTypes] = useState<string[]>([]);
    const [filters, setFilters] = useState<string[]>([]);
    const [limit, setLimit] = useState(100);
    const [loading, setLoading] = useState(false);
    const [lastQuery, setLastQuery] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
  
    /* Fetch graph with current filters --------------------------------------*/
    const fetchGraph = useCallback(async (options: { relationshipTypes?: string[], limit?: number, cypher?: string } = {}) => {
      setLoading(true);
      setError(null);
      
      const requestBody = {
        relationshipTypes: options.relationshipTypes || filters,
        limit: options.limit || limit,
        cypher: options.cypher
      };
      
      try {
        const res = await fetch('/api/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Graph API error: ${res.status}`);
        }
        
        const data = await res.json();
        
        // If we have a cypher query that returned results, save it
        if (options.cypher && data.nodes && data.nodes.length > 0) {
          setLastQuery(options.cypher);
        }
        
        // Validate data
        if (!data.nodes || !Array.isArray(data.nodes)) {
          console.warn("Invalid nodes data received:", data.nodes);
          data.nodes = [];
        }
        
        if (!data.links || !Array.isArray(data.links)) {
          console.warn("Invalid links data received:", data.links);
          data.links = [];
        }
        
        // Make sure all links have valid references
        const nodeIds = new Set(data.nodes.map(n => n.id));
        const validLinks = data.links.filter(link => 
          nodeIds.has(link.source) && nodeIds.has(link.target)
        );
        
        if (validLinks.length !== data.links.length) {
          console.warn(`Filtered out ${data.links.length - validLinks.length} invalid links`);
        }
        
        setGraph({ 
          nodes: data.nodes, 
          links: validLinks 
        });
        
        if (data.relationshipTypesAvailable) {
          setRelTypes(data.relationshipTypesAvailable);
        }
      } catch (error) {
        console.error("Error fetching graph:", error);
        setError(error instanceof Error ? error.message : "Failed to fetch graph data");
        // Set empty graph to avoid rendering issues
        setGraph({ nodes: [], links: [] });
      } finally {
        setLoading(false);
      }
    }, [filters, limit]);
  
    // Listen for graph update events from chat
    useEffect(() => {
      const handleGraphUpdate = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // Check if this is a graph_update type event
          if (data && data.type === 'graph_update' && data.data) {
            const graphData = data.data;
            
            // Validate data before setting
            if (!graphData.nodes || !Array.isArray(graphData.nodes)) {
              console.warn("Invalid nodes data received in event");
              graphData.nodes = [];
            }
            
            if (!graphData.links || !Array.isArray(graphData.links)) {
              console.warn("Invalid links data received in event");
              graphData.links = [];
            }
            
            // Filter invalid links
            const nodeIds = new Set(graphData.nodes.map(n => n.id));
            const validLinks = graphData.links.filter(link => 
              nodeIds.has(link.source) && nodeIds.has(link.target)
            );
            
            // Update the graph with new data
            setGraph({ 
              nodes: graphData.nodes, 
              links: validLinks
            });
            
            if (graphData.relationshipTypesAvailable) {
              setRelTypes(graphData.relationshipTypesAvailable);
            }
            
            if (graphData.executedQuery) {
              setLastQuery(graphData.executedQuery);
            }
          }
        } catch (error) {
          // Ignore parsing errors from regular SSE messages
        }
      };
      
      // Add event listener for SSE events
      document.addEventListener('message', handleGraphUpdate as any);
      
      return () => {
        document.removeEventListener('message', handleGraphUpdate as any);
      };
    }, []);
  
    useEffect(() => {
      fetchGraph();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, limit]);
  
    /* Toggle filter ---------------------------------------------------------*/
    const toggleFilter = (type: string) => {
      setFilters((prev) =>
        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      );
    };
  
    return (
      <div className="w-full h-full grid grid-cols-[240px_1fr] gap-3 p-3">
        {/* ▸ Sidebar -------------------------------------------------------*/}
        <aside className="overflow-y-auto bg-neutral-800 text-neutral-50 rounded-xl p-4 flex flex-col gap-4 shadow-lg">
          <div>
            <h2 className="text-lg font-semibold mb-2">Relationship Types</h2>
            {relTypes && relTypes.map((t) => (
              <label key={t} className="flex items-center gap-2 mb-1.5">
                <input
                  type="checkbox"
                  className="accent-indigo-500 h-4 w-4"
                  checked={filters.includes(t)}
                  onChange={() => toggleFilter(t)}
                />
                <span className="capitalize">{t.toLowerCase()}</span>
              </label>
            ))}
          </div>
  
          {lastQuery && (
            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-2">Last Query</h2>
              <div className="bg-neutral-700 p-2 rounded text-xs font-mono overflow-x-auto">
                {lastQuery}
              </div>
            </div>
          )}
  
          <div className="mt-auto">
            <h2 className="text-lg font-semibold mb-2">Limit Nodes ({limit})</h2>
            <input
              type="range"
              min={100}
              max={2000}
              step={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-900/50 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}
        </aside>
  
        {/* ▸ Graph canvas ---------------------------------------------------*/}
        <div className="relative w-full h-full">
          {loading && <Loader className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-spin" />}
          <GraphCanvas graph={graph} />
        </div>
      </div>
    );
  }
  