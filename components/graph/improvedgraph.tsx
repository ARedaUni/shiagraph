/*  ──────────────────────────────────────────────────────────────────────────
    GraphVisualizer.tsx                                    (drop-in component)
    -------------------------------------------------------------------------
    • Robust guard-rails: **never** passes a link whose source/target is
      undefined (fixes "node not found" once and for all).
    • Unified `buildVisibleGraph` pipeline with *strict* validation.
    • If a filter hides the currently-selected node, the side-panel closes.
    • All hooks have explicit dependency arrays – easy to reason about.
    ------------------------------------------------------------------------- */

    'use client';

    import React, {
      useState,
      useEffect,
      useRef,
      useCallback,
      useMemo,
      Dispatch,
      SetStateAction,
    } from 'react';
    import * as d3 from 'd3';
    import { motion, AnimatePresence } from 'framer-motion';
    import {
      ChevronDown,
      Loader,
      Moon,
      Sun,
      Search,
      X,
    } from 'lucide-react';
    
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Slider } from '@/components/ui/slider';
    import { Switch } from '@/components/ui/switch';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { Checkbox } from '@/components/ui/checkbox';
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Types                                                                  */
    /* ════════════════════════════════════════════════════════════════════════ */
    export interface Node {
      id: number | string;
      name?: string;
      group?: string;
      label?: string;
      description?: string;
      properties?: Record<string, unknown>;
      // d3 mutables
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      fx?: number | null;
      fy?: number | null;
    }
    
    export interface Link {
      id?: number | string;
      source: Node | number | string;
      target: Node | number | string;
      type: string;
      value?: number;
    }
    
    interface Graph {
      nodes: Node[];
      links: Link[];
    }
    
    interface ForceSettings {
      linkDistance: number;
      linkStrength: number;
      charge: number;
      collide: number;
    }
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Data-transform helpers                                                 */
    /* ════════════════════════════════════════════════════════════════════════ */
    function buildVisibleGraph(
      raw: Graph,
      relFilter: string[],
      search: string
    ): Graph {
      if (!raw.nodes.length) return { nodes: [], links: [] };
    
      /* 1. Link type filter (if any) */
      const step1 = relFilter.length
        ? raw.links.filter((l) => relFilter.includes(l.type))
        : raw.links;
    
      /* 2. Node set that is *required* by those links */
      const requiredIds = new Set<Node['id']>();
      step1.forEach((l) => {
        requiredIds.add(typeof l.source === 'object' ? l.source.id : l.source);
        requiredIds.add(typeof l.target === 'object' ? l.target.id : l.target);
      });
    
      /* 3. Add search hits                                           */
      const q = search.trim().toLowerCase();
      if (q) {
        raw.nodes.forEach((n) => {
          if (
            (n.name ?? '').toString().toLowerCase().includes(q) ||
            n.id.toString().toLowerCase().includes(q)
          )
            requiredIds.add(n.id);
        });
      }
    
      /* 4. Nodes array (object refs from raw.nodes)                   */
      const filteredNodes = raw.nodes.filter((n) => requiredIds.has(n.id));
    
      /* 5. Merge nodes with the same name                             */
      const nameToNodes = new Map<string, Node[]>();
      const uniqueNodes: Node[] = [];
      
      // Group nodes by name
      filteredNodes.forEach((node) => {
        const name = (node.name ?? node.id).toString();
        if (!nameToNodes.has(name)) {
          nameToNodes.set(name, []);
        }
        nameToNodes.get(name)!.push(node);
      });
      
      // For each name, merge the nodes
      nameToNodes.forEach((nodes, name) => {
        if (nodes.length === 1) {
          // If only one node has this name, keep it as is
          uniqueNodes.push(nodes[0]);
        } else {
          // Find any node that has position information (from previous simulation state)
          const nodeWithPosition = nodes.find(n => n.x !== undefined && n.y !== undefined);
          
          // Merge multiple nodes with the same name
          const mergedNode: Node = {
            // Use the first node's ID (could be any strategy)
            id: nodes[0].id,
            name: name,
            // Combine groups or use the first non-empty one
            group: nodes.find(n => n.group)?.group,
            // Combine labels or use the first non-empty one
            label: nodes.find(n => n.label)?.label,
            // Use the first description or combine them
            description: nodes.find(n => n.description)?.description,
            // Merge properties
            properties: nodes.reduce((acc, node) => {
              return { ...acc, ...(node.properties || {}) };
            }, {}),
            // Preserve position information if available
            ...(nodeWithPosition ? {
              x: nodeWithPosition.x,
              y: nodeWithPosition.y,
              vx: nodeWithPosition.vx,
              vy: nodeWithPosition.vy,
              fx: nodeWithPosition.fx,
              fy: nodeWithPosition.fy
            } : {})
          };
          uniqueNodes.push(mergedNode);
        }
      });
    
      /* 6. Map ids → node objects so links can share instance refs    */
      const idToNode = new Map<Node['id'], Node>();
      uniqueNodes.forEach((n) => idToNode.set(n.id, n));
      
      // Create name to node map for resolving link endpoints
      const nameToNode = new Map<string, Node>();
      uniqueNodes.forEach((n) => {
        const name = (n.name ?? n.id).toString();
        nameToNode.set(name, n);
      });
    
      /* 7. Build links array—map endpoints to merged nodes            */
      const links: Link[] = [];
      const processedLinkIds = new Set<string>();
    
      step1.forEach((l) => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        
        // Find the source node by ID
        let src = idToNode.get(sourceId);
        
        // If not found directly, check if it was merged
        if (!src && typeof l.source === 'object' && l.source.name) {
          src = nameToNode.get(l.source.name);
        }
        
        // Find the target node by ID
        let tgt = idToNode.get(targetId);
        
        // If not found directly, check if it was merged
        if (!tgt && typeof l.target === 'object' && l.target.name) {
          tgt = nameToNode.get(l.target.name);
        }
        
        // Only create the link if both endpoints exist
        if (src && tgt) {
          // Create a unique ID for the link to avoid duplicates
          const linkId = `${src.id}-${l.type}-${tgt.id}`;
          
          if (!processedLinkIds.has(linkId)) {
            links.push({
              ...l,
              source: src,
              target: tgt,
            });
            processedLinkIds.add(linkId);
          }
        }
      });
    
      return { nodes: uniqueNodes, links };
    }
    
    /* Utility */
    const cls = (...s: (string | boolean | undefined)[]) => s.filter(Boolean).join(' ');
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Sidebar                                                                */
    /* ════════════════════════════════════════════════════════════════════════ */
    interface SidebarProps {
      relTypes: string[];
      relFilter: string[];
      toggleRel: (t: string) => void;
      limit: number;
      setLimit: Dispatch<SetStateAction<number>>;
      search: string;
      setSearch: Dispatch<SetStateAction<string>>;
      forces: ForceSettings;
      setForces: Dispatch<SetStateAction<ForceSettings>>;
      showLabels: boolean;
      setShowLabels: Dispatch<SetStateAction<boolean>>;
      dark: boolean;
      setDark: Dispatch<SetStateAction<boolean>>;
      loading: boolean;
    }
    
    const Sidebar: React.FC<SidebarProps> = ({
      relTypes,
      relFilter,
      toggleRel,
      limit,
      setLimit,
      search,
      setSearch,
      forces,
      setForces,
      showLabels,
      setShowLabels,
      dark,
      setDark,
      loading,
    }) => {
      const [open, setOpen] = useState(true);
      const rot = { open: { rotate: 0 }, closed: { rotate: 180 } };
    
      return (
        <motion.aside
          className={cls(
            'absolute top-4 left-4 z-30 backdrop-blur rounded-2xl shadow-xl overflow-hidden bg-neutral-900/90 text-neutral-100',
            open ? 'w-72' : 'w-14'
          )}
          initial={false}
          animate={open ? 'open' : 'closed'}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        >
          {/* header */}
          <header className="flex items-center justify-between p-4 border-b border-neutral-800">
            {open && <h2 className="font-bold text-lg">Controls</h2>}
            <div className="flex gap-2 ml-auto items-center">
              {open && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDark(!dark)}
                  className="text-neutral-400 hover:text-neutral-100"
                >
                  {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setOpen(!open)}
                className="text-neutral-400 hover:text-neutral-100"
              >
                <motion.div animate={open ? 'open' : 'closed'} variants={rot}>
                  <ChevronDown className="h-4 w-4" />
                </motion.div>
              </Button>
            </div>
          </header>
    
          {/* body */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="body"
                className="p-4 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* search */}
                <div>
                  <label className="text-sm font-medium flex items-center gap-2 mb-1">
                    <Search className="h-4 w-4" />
                    Search
                  </label>
                  <Input
                    value={search}
                    placeholder="node..."
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-neutral-800 border-neutral-700"
                  />
                </div>
    
                {/* limit */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Node limit</span> <span>{limit}</span>
                  </div>
                  <Slider
                    min={100}
                    max={5000}
                    step={100}
                    value={[limit]}
                    onValueChange={([v]) => setLimit(v)}
                  />
                </div>
    
                {/* rel types */}
                <div>
                  <p className="text-sm font-medium mb-1">Relationship types</p>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {relTypes.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-xs capitalize">
                        <Checkbox
                          checked={relFilter.includes(t)}
                          onCheckedChange={() => toggleRel(t)}
                          className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                        />
                        {t.toLowerCase()}
                      </label>
                    ))}
                  </div>
                </div>
    
                {/* forces */}
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Forces</summary>
                  <div className="mt-2 space-y-4">
                    {(
                      [
                        ['Charge', 'charge', -1500, 50, 50],
                        ['Link dist', 'linkDistance', 20, 300, 10],
                        ['Link strength', 'linkStrength', 0, 2, 0.05],
                        ['Collide radius', 'collide', 0, 60, 2],
                      ] as const
                    ).map(([label, key, min, max, step]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{label}</span>
                          <span>{(forces as any)[key as keyof ForceSettings].toFixed(1)}</span>
                        </div>
                        <Slider
                          min={min}
                          max={max}
                          step={step}
                          value={[(forces as any)[key]]}
                          onValueChange={([v]) => setForces((f) => ({ ...f, [key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </details>
    
                {/* display */}
                <div className="flex items-center justify-between">
                  <span className="text-sm">Link labels</span>
                  <Switch checked={showLabels} onCheckedChange={setShowLabels} />
                </div>
    
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Loader className="animate-spin h-4 w-4" /> Loading…
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      );
    };
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Node detail panel                                                      */
    /* ════════════════════════════════════════════════════════════════════════ */
    interface NodePanelProps {
      node: Node;
      close: () => void;
      graph: Graph;
    }
    
    const NodePanel: React.FC<NodePanelProps> = ({ node, close, graph }) => {
      const conns = useMemo(() => {
        const res: { dir: 'in' | 'out'; other: Node; link: Link }[] = [];
        graph.links.forEach((l) => {
          const s = l.source as Node;
          const t = l.target as Node;
          if (s.id === node.id) res.push({ dir: 'out', other: t, link: l });
          else if (t.id === node.id) res.push({ dir: 'in', other: s, link: l });
        });
        return res;
      }, [node, graph.links]);
    
      return (
        <motion.div
          key="panel"
          initial={{ x: 350, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 350, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 35 }}
          className="absolute right-4 top-4 w-80 z-20"
        >
          <Card className="bg-neutral-900 border-neutral-700 text-neutral-100">
            <CardHeader>
              <CardTitle className="flex justify-between gap-2 text-lg">
                {node.name ?? node.id}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={close}
                  className="text-neutral-400 hover:text-neutral-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="text-xs text-neutral-400">
                {node.group ?? node.label}
              </div>
    
              {node.description && <p className="text-sm">{node.description}</p>}
    
              {node.properties && (
                <div className="space-y-1 text-xs">
                  {Object.entries(node.properties).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-neutral-400">{k}</span>
                      <span className="break-all">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
    
              {!!conns.length && (
                <div className="space-y-1 text-xs">
                  <p className="font-medium">Connections</p>
                  {conns.map(({ dir, other, link }, i) => (
                    <div
                      key={i}
                      className="flex justify-between bg-neutral-800 px-2 py-1 rounded"
                    >
                      <span>{other.name ?? other.id}</span>
                      <span className="text-indigo-400">
                        {dir === 'out' ? '→' : '←'} {link.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      );
    };
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Main component                                                         */
    /* ════════════════════════════════════════════════════════════════════════ */
    const GraphVisualizer: React.FC = () => {
      /* ── state ──────────────────────────────────────────────────────────── */
      const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
      const [relTypes, setRelTypes] = useState<string[]>([]);
      const [relFilter, setRelFilter] = useState<string[]>([]);
      const [search, setSearch] = useState('');
      const [limit, setLimit] = useState(1000);
    
      const [forces, setForces] = useState<ForceSettings>({
        linkDistance: 120,
        linkStrength: 1,
        charge: -500,
        collide: 30,
      });
      const [showLabels, setShowLabels] = useState(false);
    
      const [selectedNode, setSelectedNode] = useState<Node | null>(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [dark, setDark] = useState(false);
    
      /* ── DOM refs ───────────────────────────────────────────────────────── */
      const containerRef = useRef<HTMLDivElement>(null);
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const simRef = useRef<d3.Simulation<Node, Link>>();
      const zoomTransform = useRef<d3.ZoomTransform>(d3.zoomIdentity);
      const frameRef = useRef<number | null>(null);
    
      /* ── size sync ──────────────────────────────────────────────────────── */
      const [size, setSize] = useState<[number, number]>([0, 0]);
      useEffect(() => {
        if (!containerRef.current) return;
        const resize = () =>
          setSize([
            containerRef.current!.clientWidth,
            containerRef.current!.clientHeight,
          ]);
        resize();
        const obs = new ResizeObserver(resize);
        obs.observe(containerRef.current);
        return () => obs.disconnect();
      }, []);
    
      /* ── data fetch ─────────────────────────────────────────────────────── */
      const fetchGraph = useCallback(async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit }),
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const data = await res.json();
          
          // Process the data to deduplicate nodes with the same name at source
          const processedData = preprocessGraphData(data);
          
          setGraph({ 
            nodes: processedData.nodes ?? [], 
            links: processedData.links ?? [] 
          });
          setRelTypes(data.relationshipTypesAvailable ?? []);
          setError(null);
        } catch (e) {
          setError((e as Error).message);
          setGraph({ nodes: [], links: [] });
        } finally {
          setLoading(false);
        }
      }, [limit]);
    
      // Preprocess graph data to merge nodes with the same name
      const preprocessGraphData = (data: any): Graph => {
        const { nodes = [], links = [] } = data;
        
        // Map to store unique nodes by name
        const nameToUniqueNode = new Map<string, Node>();
        const idToNameMap = new Map<Node['id'], string>();
        
        // First pass: create unique nodes by name
        nodes.forEach((node: Node) => {
          const name = (node.name ?? node.id).toString();
          
          if (!nameToUniqueNode.has(name)) {
            // This is the first node with this name
            nameToUniqueNode.set(name, { ...node });
          } else {
            // Merge with existing node with the same name
            const existingNode = nameToUniqueNode.get(name)!;
            
            // Update the existing node with any new properties
            if (node.group && !existingNode.group) existingNode.group = node.group;
            if (node.label && !existingNode.label) existingNode.label = node.label;
            if (node.description && !existingNode.description) existingNode.description = node.description;
            
            // Merge properties
            existingNode.properties = {
              ...(existingNode.properties || {}),
              ...(node.properties || {})
            };
          }
          
          // Keep track of which ID maps to which name
          idToNameMap.set(node.id, name);
        });
        
        // Convert the map of unique nodes back to an array
        const uniqueNodes = Array.from(nameToUniqueNode.values());
        
        // Process links to point to the deduplicated nodes
        const processedLinks: Link[] = [];
        const linkMap = new Map<string, Link>();
        
        links.forEach((link: Link) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          
          // Get the names for the source and target nodes
          const sourceName = idToNameMap.get(sourceId);
          const targetName = idToNameMap.get(targetId);
          
          if (sourceName && targetName) {
            // Get the deduplicated nodes
            const sourceNode = nameToUniqueNode.get(sourceName);
            const targetNode = nameToUniqueNode.get(targetName);
            
            if (sourceNode && targetNode) {
              // Create a unique identifier for this link
              const linkKey = `${sourceName}-${link.type}-${targetName}`;
              
              if (!linkMap.has(linkKey)) {
                // This is a new unique link
                linkMap.set(linkKey, {
                  ...link,
                  source: sourceNode,
                  target: targetNode
                });
              }
            }
          }
        });
        
        return {
          nodes: uniqueNodes,
          links: Array.from(linkMap.values())
        };
      };
    
      useEffect(() => {
        fetchGraph();
      }, [fetchGraph]);
    
      /* ── visible graph (memo) ───────────────────────────────────────────── */
      const visible = useMemo(
        () => buildVisibleGraph(graph, relFilter, search),
        [graph, relFilter, search]
      );
    
      /* close panel if selected node is filtered out */
      useEffect(() => {
        if (selectedNode && !visible.nodes.includes(selectedNode)) {
          setSelectedNode(null);
        }
      }, [visible.nodes, selectedNode]);
    
      /* ── canvas renderer ────────────────────────────────────────────────── */
      const render = useCallback(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const [w, h] = size;
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        ctx.translate(zoomTransform.current.x, zoomTransform.current.y);
        ctx.scale(zoomTransform.current.k, zoomTransform.current.k);
    
        const color = d3
          .scaleOrdinal<string>()
          .domain(
            d3.map(visible.nodes, (d) => d.group ?? d.label ?? 'x').keys()
          )
          .range(d3.schemeCategory10);
    
        /* links */
        ctx.globalAlpha = 0.6;
        visible.links.forEach((l) => {
          const s = l.source as Node;
          const t = l.target as Node;
          if (s.x == null || t.x == null || s.y == null || t.y == null) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = '#B0B0B0';
          ctx.lineWidth = 1;
          ctx.stroke();
    
          if (showLabels && zoomTransform.current.k > 0.8) {
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(Math.atan2(t.y - s.y, t.x - s.x));
            ctx.fillStyle = dark ? '#eee' : '#555';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(l.type, 0, -2);
            ctx.restore();
          }
        });
    
        /* nodes */
        visible.nodes.forEach((n) => {
          if (n.x == null || n.y == null) return;
          const r = n === selectedNode ? 12 : 8;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = color(n.group ?? n.label ?? 'x');
          ctx.fill();
          ctx.strokeStyle = n === selectedNode ? '#000' : '#fff';
          ctx.lineWidth = n === selectedNode ? 2 : 1;
          ctx.stroke();
    
          if (zoomTransform.current.k > 1.1 || n === selectedNode) {
            ctx.fillStyle = dark ? '#eee' : '#111';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(n.name ?? n.id.toString(), n.x, n.y + r + 12);
          }
        });
    
        ctx.restore();
        frameRef.current = null;
      }, [visible, size, selectedNode, showLabels, dark]);
    
      /* ── simulation config ──────────────────────────────────────────────── */
      useEffect(() => {
        if (!visible.nodes.length) return;
    
        if (!simRef.current) {
          simRef.current = d3.forceSimulation<Node, Link>();
        }
        const sim = simRef.current;
    
        sim
          .nodes(visible.nodes)
          .force(
            'link',
            d3
              .forceLink<Node, Link>(visible.links)
              .id((d) => d.id)
              .distance(forces.linkDistance)
              .strength(forces.linkStrength)
          )
          .force('charge', d3.forceManyBody().strength(forces.charge))
          .force('center', d3.forceCenter(size[0] / 2, size[1] / 2))
          .force('collide', d3.forceCollide(forces.collide))
          .alpha(1)
          .restart()
          .on('tick', () => {
            if (frameRef.current == null) frameRef.current = requestAnimationFrame(render);
          });
    
        return () => sim.stop();
      }, [visible, forces, size, render]);
    
      /* ── zoom & drag ────────────────────────────────────────────────────── */
      useEffect(() => {
        if (!canvasRef.current) return;
        const sel = d3.select(canvasRef.current);
    
        const zoom = d3
          .zoom<HTMLCanvasElement, unknown>()
          .scaleExtent([0.1, 5])
          .on('zoom', (e) => {
            zoomTransform.current = e.transform;
            render();
          });
    
        sel.call(zoom as any);
    
        /* drag behaviour (stopPropagation prevents zoom conflict) */
        function subject(event: any) {
          const [x, y] = zoomTransform.current.invert([event.x, event.y]);
          return d3
            .quadtree(visible.nodes, (d) => d.x ?? 0, (d) => d.y ?? 0)
            .find(x, y, 20);
        }
    
        const drag = d3
          .drag<HTMLCanvasElement, Node>()
          .subject(subject as any)
          .on('start', (e) => {
            (e.sourceEvent as MouseEvent).stopPropagation();
            simRef.current?.alphaTarget(0.3).restart();
            e.subject.fx = e.subject.x;
            e.subject.fy = e.subject.y;
          })
          .on('drag', (e) => {
            const [x, y] = zoomTransform.current.invert([e.x, e.y]);
            e.subject.fx = x;
            e.subject.fy = y;
          })
          .on('end', (e) => {
            simRef.current?.alphaTarget(0);
            e.subject.fx = null;
            e.subject.fy = null;
          });
    
        sel.call(drag as any);
    
        /* click to select */
        sel.on('click', (ev) => {
          const [mx, my] = d3.pointer(ev as any);
          const [x, y] = zoomTransform.current.invert([mx, my]);
          const n = d3
            .quadtree(visible.nodes, (d) => d.x ?? 0, (d) => d.y ?? 0)
            .find(x, y, 15);
          setSelectedNode(n ?? null);
        });
    
        return () => {
          sel.on('.zoom', null).on('.drag', null).on('click', null);
        };
      }, [visible, render]);
    
      /* ── render ─────────────────────────────────────────────────────────── */
      return (
        <div
          ref={containerRef}
          className={cls(
            'relative w-full h-full select-none',
            dark ? 'dark bg-neutral-950 text-neutral-100' : 'bg-white'
          )}
        >
          {/* canvas */}
          <canvas
            ref={canvasRef}
            width={size[0]}
            height={size[1]}
            className="block w-full h-full cursor-grab"
          />
    
          {/* node detail panel */}
          <AnimatePresence>
            {selectedNode && (
              <NodePanel
                node={selectedNode}
                graph={visible}
                close={() => setSelectedNode(null)}
              />
            )}
          </AnimatePresence>
    
          {/* sidebar */}
          <Sidebar
            relTypes={relTypes}
            relFilter={relFilter}
            toggleRel={(t) =>
              setRelFilter((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
            }
            limit={limit}
            setLimit={setLimit}
            search={search}
            setSearch={setSearch}
            forces={forces}
            setForces={setForces}
            showLabels={showLabels}
            setShowLabels={setShowLabels}
            dark={dark}
            setDark={setDark}
            loading={loading}
          />
    
          {error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg text-sm">
              {error}
            </div>
          )}
        </div>
      );
    };
    
    export default GraphVisualizer;
    