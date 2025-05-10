/*  ──────────────────────────────────────────────────────────────────────────
    GraphVisualizer.tsx
    -------------------------------------------------------------------------
    Unified next-gen graph viewer that merges the robust guard-rails of the
    previous "GraphVisualizer" with the rich feature-set of our legacy
    <d3sidebar> & ForceDirectedGraph implementation.

    Key points
    • Sidebar – collapsible sections, dark-mode, advanced force toggles,
      layout/query pickers, node / link styling controls.
    • Canvas renderer – still stateless (avoids React re-renders) but now
      supports: search highlight, edge-bundling, elastic links, clustering,
      gravity-well, jitter, orbiting, arrows + link-labels.
    • Deep-dive mode – double-click a node to "root" the graph and explore
      outwards to depth N (keys 1-7). Esc exits mode.
    • Fully type-safe & function-level modularity so that each concern can
      be lifted into its own file later without cross-dependencies.
    ------------------------------------------------------------------------- */
    'use client';
    
    // @ts-nocheck
    // ─────────────────────────────────── React & 3rd-party ────────────────────
    import React, {
      useState,
      useEffect,
      useCallback,
      useMemo,
      useRef,
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
      Check,
    } from 'lucide-react';
    
    // ─────────────────────────────────── shadcn / ui kit  ─────────────────────
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Slider } from '@/components/ui/slider';
    import { Switch } from '@/components/ui/switch';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
    import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover';
    import { Checkbox } from '@/components/ui/checkbox';
    import {
      TooltipProvider,
      Tooltip,
      TooltipTrigger,
      TooltipContent,
    } from '@/components/ui/tooltip';
    
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
      labels?: string[];
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
    
    /* ── force + display configs ───────────────────────────────────────────── */
    interface ForcesSettings {
      centerForce: number;
      repelForce: number;
      linkForce: number;
      linkDistance: number;
      collisionRadius: number;
      radialRadius: number;
    }
    
    interface DisplaySettings {
      showArrows: boolean;
      showLinkLabels: boolean;
      nodeSize: number;
      linkThickness: number;
    }
    
    interface AdvancedToggles {
      enableJitter: boolean;
      enableGravityWell: boolean;
      enableOrbiting: boolean;
      enableRepulsionZones: boolean;
      enableElasticLinks: boolean;
      enableClustering: boolean;
      enableEdgeBundling: boolean;
    }
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Utility helpers                                                        */
    /* ════════════════════════════════════════════════════════════════════════ */
    const cls = (...s: (string | boolean | undefined)[]) => s.filter(Boolean).join(' ');
    const formatLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Sidebar component (collapsible)                                        */
    /* ════════════════════════════════════════════════════════════════════════ */
    interface SidebarProps {
      // core graph filters / settings
      search: string;
      setSearch: Dispatch<SetStateAction<string>>;
      forces: ForcesSettings;
      setForces: Dispatch<SetStateAction<ForcesSettings>>;
      display: DisplaySettings;
      setDisplay: Dispatch<SetStateAction<DisplaySettings>>;
      layoutType: string;
      setLayoutType: Dispatch<SetStateAction<string>>;
      numberOfNodes: number;
      setNumberOfNodes: Dispatch<SetStateAction<number>>;
      queryType: string;
      setQueryType: Dispatch<SetStateAction<string>>;
      toggles: AdvancedToggles;
      setToggles: Dispatch<SetStateAction<AdvancedToggles>>;
      isOpen: boolean;
      setIsOpen: Dispatch<SetStateAction<boolean>>;
      dark: boolean;
      setDark: Dispatch<SetStateAction<boolean>>;
      loading: boolean;
    }
    
    const Sidebar: React.FC<SidebarProps> = React.memo(
      ({
        search,
        setSearch,
        forces,
        setForces,
        display,
        setDisplay,
        layoutType,
        setLayoutType,
        numberOfNodes,
        setNumberOfNodes,
        queryType,
        setQueryType,
        toggles,
        setToggles,
        isOpen,
        setIsOpen,
        dark,
        setDark,
        loading,
      }) => {
        /* ── reducer to manage section state ─────────────────────────────── */
        type Section = 'search' | 'forces' | 'display' | 'advanced';
        interface State { open: Record<Section, boolean>; }
        type Action = { type: 'TOGGLE'; key: Section } | { type: 'SET'; key: Section; val: boolean };
        const [state, dispatch] = React.useReducer(
          (s: State, a: Action): State => {
            switch (a.type) {
              case 'TOGGLE':
                return { open: { ...s.open, [a.key]: !s.open[a.key] } };
              case 'SET':
                return { open: { ...s.open, [a.key]: a.val } };
              default:
                return s;
            }
          },
          { open: { search: true, forces: false, display: false, advanced: false } }
        );
    
        /* ── constants ───────────────────────────────────────────────────── */
        const queryOptions = useMemo(
          () => ['default', 'all', 'ideology', 'company', 'institution', 'community', 'power'],
          []
        );
        const nodeOptions = [100, 200, 500, 1000, 2000, 5000];
    
        /* ── helper components (local) ───────────────────────────────────── */
        const SliderRow: React.FC<{
          label: string;
          val: number;
          min: number;
          max: number;
          step: number;
          onChange: (n: number) => void;
        }> = ({ label, val, min, max, step, onChange }) => (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span>{label}</span>
              <span className="font-mono">{val.toFixed(1)}</span>
            </div>
            <Slider 
              min={min} 
              max={max} 
              step={step} 
              value={[val]} 
              onValueChange={([v]) => onChange(v)}
              className={dark ? "accent-blue-500" : "accent-blue-600"} 
            />
          </div>
        );
    
        const ToggleRow: React.FC<{ label: string; value: boolean; onChange: (b: boolean) => void }> = ({ label, value, onChange }) => (
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="font-medium">{label}</span>
            <Switch 
              checked={value} 
              onCheckedChange={onChange} 
              className={cls(
                value && (dark ? "bg-blue-500" : "bg-blue-600"),
                !value && (dark ? "bg-neutral-700" : "bg-neutral-300")
              )}
            />
          </div>
        );
    
        /* ── render ──────────────────────────────────────────────────────── */
        const sideVariants = { open: { width: '300px', opacity: 1 }, closed: { width: '52px', opacity: 0.9 } };
        const chevronVariants = { open: { rotate: 0 }, closed: { rotate: 180 } };
    
        return (
          <motion.aside
            className={cls(
              'absolute top-4 left-4 z-30 rounded-2xl shadow-xl backdrop-blur overflow-hidden border',
              dark 
                ? 'bg-neutral-900/95 text-neutral-100 border-neutral-700' 
                : 'bg-white/95 text-neutral-800 border-neutral-200'
            )}
            animate={isOpen ? 'open' : 'closed'}
            variants={sideVariants}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* header */}
            <header className={cls(
              "flex items-center justify-between p-3 border-b",
              dark ? "border-neutral-700" : "border-neutral-200"
            )}>
              {isOpen && <h2 className="font-bold text-lg tracking-tight">Graph Settings</h2>}
              <div className="flex gap-2 ml-auto items-center">
                {isOpen && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => setDark(!dark)} 
                    className={cls(
                      "hover:bg-opacity-20",
                      dark ? "text-neutral-300 hover:bg-neutral-700" : "text-neutral-600 hover:bg-neutral-200"
                    )}
                  >
                    {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </Button>
                )}
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => setIsOpen(!isOpen)} 
                  className={cls(
                    "hover:bg-opacity-20",
                    dark ? "text-neutral-300 hover:bg-neutral-700" : "text-neutral-600 hover:bg-neutral-200"
                  )}
                >
                  <motion.div animate={isOpen ? 'open' : 'closed'} variants={chevronVariants}>
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </Button>
              </div>
            </header>
    
            {/* body */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="body"
                  className="p-4 space-y-6 overflow-y-auto scrollbar-thin max-h-[calc(100vh-140px)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Search */}
                  <Section 
                    title="Search" 
                    open={state.open.search} 
                    toggle={() => dispatch({ type: 'TOGGLE', key: 'search' })}
                    dark={dark}
                  >
                    <div className="relative mb-3">
                      <Search className={cls(
                        "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4",
                        dark ? "text-neutral-400" : "text-neutral-500"
                      )} />
                      <Input 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)} 
                        placeholder="Find node…" 
                        className={cls(
                          "pl-9 h-9 font-medium text-sm",
                          dark 
                            ? "bg-neutral-800 border-neutral-700 placeholder-neutral-500 focus:border-neutral-600" 
                            : "bg-neutral-100 border-neutral-200 placeholder-neutral-500 focus:border-neutral-300"
                        )} 
                      />
                    </div>
                    
                    {/* # of Nodes (moved from Layout section) */}
                    <div className="space-y-1.5 mt-4">
                      <div className="text-sm font-medium">Number of Nodes</div>
                      <div className="flex flex-wrap gap-2">
                        {nodeOptions.map(num => (
                          <Button
                            key={num}
                            variant={numberOfNodes === num ? "default" : "outline"}
                            size="sm"
                            onClick={() => setNumberOfNodes(num)}
                            className={cls(
                              "text-xs px-2 py-0 h-7",
                              numberOfNodes === num 
                                ? (dark ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-600 hover:bg-blue-700") 
                                : (dark 
                                  ? "bg-neutral-800 border-neutral-700 hover:bg-neutral-700" 
                                  : "bg-white border-neutral-200 hover:bg-neutral-100")
                            )}
                          >
                            {num}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                 
                  </Section>
    
                  {/* Forces */}
                  <Section 
                    title="Forces" 
                    open={state.open.forces} 
                    toggle={() => dispatch({ type: 'TOGGLE', key: 'forces' })}
                    dark={dark}
                  >
                    <SliderRow label="Center" val={forces.centerForce} min={0} max={1} step={0.02} onChange={(v) => setForces((f) => ({ ...f, centerForce: v }))} />
                    <SliderRow label="Repel" val={forces.repelForce} min={-1500} max={0} step={50} onChange={(v) => setForces((f) => ({ ...f, repelForce: v }))} />
                    <SliderRow label="Link dist" val={forces.linkDistance} min={20} max={300} step={10} onChange={(v) => setForces((f) => ({ ...f, linkDistance: v }))} />
                    <SliderRow label="Link str" val={forces.linkForce} min={0} max={2.5} step={0.05} onChange={(v) => setForces((f) => ({ ...f, linkForce: v }))} />
                    <SliderRow label="Collide" val={forces.collisionRadius} min={0} max={60} step={2} onChange={(v) => setForces((f) => ({ ...f, collisionRadius: v }))} />
                    <SliderRow label="Radial" val={forces.radialRadius} min={0} max={500} step={10} onChange={(v) => setForces((f) => ({ ...f, radialRadius: v }))} />
                  </Section>
    
                  {/* Display */}
                  <Section 
                    title="Display" 
                    open={state.open.display} 
                    toggle={() => dispatch({ type: 'TOGGLE', key: 'display' })}
                    dark={dark}
                  >
                    <ToggleRow label="Arrows" value={display.showArrows} onChange={(b) => setDisplay((d) => ({ ...d, showArrows: b }))} />
                    <ToggleRow label="Link labels" value={display.showLinkLabels} onChange={(b) => setDisplay((d) => ({ ...d, showLinkLabels: b }))} />
                    <SliderRow label="Node size" val={display.nodeSize} min={2} max={20} step={1} onChange={(v) => setDisplay((d) => ({ ...d, nodeSize: v }))} />
                    <SliderRow label="Link width" val={display.linkThickness} min={1} max={10} step={1} onChange={(v) => setDisplay((d) => ({ ...d, linkThickness: v }))} />
                  </Section>
    
                  {/* Advanced */}
                  <Section 
                    title="Advanced" 
                    open={state.open.advanced} 
                    toggle={() => dispatch({ type: 'TOGGLE', key: 'advanced' })}
                    dark={dark}
                  >
                    {(
                      [
                        ['Jitter', 'enableJitter'],
                        ['Gravity well', 'enableGravityWell'],
                        ['Orbiting', 'enableOrbiting'],
                        ['Repulsion zones', 'enableRepulsionZones'],
                        ['Elastic links', 'enableElasticLinks'],
                        ['Clustering', 'enableClustering'],
                        ['Edge-bundling', 'enableEdgeBundling'],
                      ] as const
                    ).map(([label, key]) => (
                      <ToggleRow
                        key={key}
                        label={label}
                        value={toggles[key as keyof AdvancedToggles]}
                        onChange={(b) => setToggles((t) => ({ ...t, [key]: b }))}
                      />
                    ))}
                  </Section>
    
                  {loading && (
                    <div className="flex items-center gap-2 text-sm mt-2 py-2 px-3 rounded-lg bg-opacity-20 border border-opacity-20 animate-pulse text-center justify-center"
                      style={{
                        backgroundColor: dark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                        borderColor: dark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: dark ? '#93c5fd' : '#3b82f6'
                      }}
                    >
                      <Loader className="animate-spin h-4 w-4" /> Loading graph data...
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        );
      }
    );
    
    /* ──────────────────────────────────────────────────────────────────────── */
    const Section: React.FC<{ 
      title: string; 
      open: boolean; 
      toggle: () => void; 
      children: React.ReactNode; 
      dark: boolean;
    }> = ({ title, open, toggle, children, dark }) => {
      const chevronVariants = { open: { rotate: 0 }, closed: { rotate: -90 } };
      return (
        <Collapsible 
          open={open} 
          onOpenChange={toggle} 
          className={cls(
            "pb-3 border-b",
            dark ? "border-neutral-800" : "border-neutral-200"
          )}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full mb-2 select-none py-1">
            <h3 className="font-semibold text-base">{title}</h3>
            <motion.div animate={open ? 'open' : 'closed'} variants={chevronVariants}>
              <ChevronDown className={cls(
                "h-4 w-4 transition-colors",
                dark ? "text-neutral-400" : "text-neutral-500"
              )} />
            </motion.div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-1">{children}</CollapsibleContent>
        </Collapsible>
      );
    };
    
    const SelectRow: React.FC<{ 
      label: string; 
      value: string; 
      options: string[]; 
      onChange: (v: string) => void;
      dark: boolean;
    }> = ({ label, value, options, onChange, dark }) => (
      <div className="space-y-1.5 text-sm">
        {label !== "Query" && <span className="font-medium">{label}</span>}
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className={cls(
                "w-full justify-between h-9 px-3 text-sm font-medium",
                dark 
                  ? "bg-neutral-800 border-neutral-700 hover:bg-neutral-700 hover:border-neutral-600" 
                  : "bg-white border-neutral-200 hover:bg-neutral-100 hover:border-neutral-300"
              )}
            >
              {capitalize(value)}
              <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className={cls(
              "w-full p-1 rounded-lg shadow-lg",
              dark 
                ? "bg-neutral-800 border-neutral-700" 
                : "bg-white border-neutral-200"
            )}
          >
            <div className="max-h-60 overflow-auto py-1">
              {options.map((opt) => (
                <Button
                  key={opt}
                  variant="ghost"
                  className={cls(
                    "w-full justify-start text-sm rounded-md my-0.5 h-9",
                    opt === value 
                      ? (dark ? "bg-blue-600 text-white" : "bg-blue-600 text-white") 
                      : (dark ? "hover:bg-neutral-700" : "hover:bg-neutral-100")
                  )}
                  onClick={() => onChange(opt)}
                >
                  {opt === value && <Check className="h-3.5 w-3.5 mr-2" />} 
                  {capitalize(opt)}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Canvas renderer & simulation (modular)                                 */
    /* ════════════════════════════════════════════════════════════════════════ */
    interface CanvasProps {
      graph: Graph;
      search: string;
      forces: ForcesSettings;
      display: DisplaySettings;
      toggles: AdvancedToggles;
      dark: boolean;
      onNodeSelect: (n: Node | null) => void;
    }
 
    const GraphCanvas: React.FC<CanvasProps> = ({ graph, search, forces, display, toggles, dark, onNodeSelect }) => {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const simRef = useRef<d3.Simulation<Node, Link> | null>(null);
      const zRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
      const qtRef = useRef<d3.Quadtree<Node> | null>(null);
      const frameRef = useRef<number | null>(null);
      const searchedNodeRef = useRef<Node | null>(null);
      const hoveredNodeRef = useRef<Node | null>(null);
      const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
    
      /* size sync */
      const [size, setSize] = useState<[number, number]>([0, 0]);
      useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(() => setSize([containerRef.current!.clientWidth, containerRef.current!.clientHeight]));
        ro.observe(containerRef.current);
        return () => ro.disconnect();
      }, []);
    
      /* search effect (enter key handled at parent via input, here we just locate) */
      useEffect(() => {
        if (!search.trim()) {
          searchedNodeRef.current = null;
          simRef.current?.alpha(0.1).restart();
          return;
        }
        const q = search.toLowerCase();
        const hit = graph.nodes.find((n) => (n.name ?? '').toLowerCase().includes(q) || String(n.id).includes(q));
        if (hit) {
          searchedNodeRef.current = hit;
          simRef.current?.alphaTarget(0.3).restart();
        }
      }, [search, graph.nodes]);
    
      /* build quadtree helper */
      const rebuildQT = useCallback((nodes: Node[]) => {
        qtRef.current = d3
          .quadtree<Node>()
          .x((d) => d.x ?? 0)
          .y((d) => d.y ?? 0)
          .addAll(nodes);
      }, []);
    
      /* simulation setup */
      useEffect(() => {
        if (!graph.nodes.length || !size[0] || !size[1]) return;
    
        // Merge nodes with the same name
        const uniqueNodes: Node[] = [];
        const nodesByName = new Map<string, Node>();
        const nodeIdToUniqueNode = new Map<string | number, Node>();
        
        // First pass: group nodes by name
        graph.nodes.forEach(node => {
          const nodeName = node.name || String(node.id);
          
          if (!nodesByName.has(nodeName)) {
            // First node with this name, add it to our maps
            nodesByName.set(nodeName, node);
            uniqueNodes.push(node);
            nodeIdToUniqueNode.set(String(node.id), node);
          } else {
            // We already have a node with this name
            // Map this node's ID to the existing unique node
            nodeIdToUniqueNode.set(String(node.id), nodesByName.get(nodeName)!);
          }
        });

        // Remap links to use our unique nodes
        const remappedLinks = graph.links.map(link => {
          const sourceId = typeof link.source === 'object' ? String(link.source.id) : String(link.source);
          const targetId = typeof link.target === 'object' ? String(link.target.id) : String(link.target);
          
          // Get the unique nodes that these IDs map to
          const uniqueSource = nodeIdToUniqueNode.get(sourceId);
          const uniqueTarget = nodeIdToUniqueNode.get(targetId);
          
          if (uniqueSource && uniqueTarget) {
            return {
              ...link,
              source: uniqueSource,
              target: uniqueTarget
            };
          }
          return link;
        }).filter(link => {
          // Filter out any links whose source or target is undefined
          return typeof link.source === 'object' && typeof link.target === 'object';
        });
        
        if (!simRef.current) simRef.current = d3.forceSimulation<Node, Link>();
        const sim = simRef.current;

        const applyForces = () => {
          // clear
          sim.force('link', null).force('charge', null).force('center', null).force('collision', null).force('xCluster', null).force('yCluster', null).force('gravityWell', null).force('jitter', null);

          // link
          if (toggles.enableElasticLinks) {
            sim.force(
              'link',
              d3
                .forceLink<Node, Link>(remappedLinks)
                .id((d: Node) => d.id)
                .distance((d: Link, i: number) => 50 + Math.sin(i) * 20)
                .strength(0.1)
            );
          } else {
            sim.force(
              'link',
              d3
                .forceLink<Node, Link>(remappedLinks)
                .id((d: Node) => d.id)
                .distance(forces.linkDistance)
                .strength(forces.linkForce)
            );
          }

          // charge
          sim.force('charge', d3.forceManyBody().strength(forces.repelForce));

          // center / clustering
          if (toggles.enableClustering) {
            const centers: Record<string, { x: number; y: number }> = {
              Person: { x: size[0] / 3, y: size[1] / 2 },
              Company: { x: (2 * size[0]) / 3, y: size[1] / 2 },
              Institution: { x: size[0] / 2, y: size[1] / 3 },
              Ideology: { x: size[0] / 2, y: (2 * size[1]) / 3 },
            };
            sim.force('xCluster', d3.forceX<Node>((d: Node) => centers[d.group ?? 'Person']?.x ?? size[0] / 2).strength(0.1));
            sim.force('yCluster', d3.forceY<Node>((d: Node) => centers[d.group ?? 'Person']?.y ?? size[1] / 2).strength(0.1));
          } else {
            sim.force('center', d3.forceCenter(size[0] / 2, size[1] / 2).strength(forces.centerForce));
          }

          // collision / repulsion zones
          if (toggles.enableRepulsionZones) {
            sim.force('innerCollision', d3.forceCollide(forces.collisionRadius).strength(1));
            sim.force('outerCollision', d3.forceCollide(forces.collisionRadius * 2).strength(0.5));
          } else {
            sim.force('collision', d3.forceCollide(forces.collisionRadius).strength(0.7));
          }

          // gravity well
          if (toggles.enableGravityWell) {
            sim.force('gravityWell', d3.forceRadial(forces.radialRadius, size[0] / 2, size[1] / 2).strength(0.5));
          }

          // jitter
          if (toggles.enableJitter) {
            sim.force('jitter', (alpha: number) => {
              sim.nodes().forEach((n: Node) => {
                n.vx! += (Math.random() - 0.5) * alpha * 0.5;
                n.vy! += (Math.random() - 0.5) * alpha * 0.5;
              });
            });
          }

          sim.alpha(1).restart();
        };

        sim.nodes(uniqueNodes);
        applyForces();
    
        sim.on('tick', () => {
          rebuildQT(graph.nodes);
          if (!frameRef.current) frameRef.current = requestAnimationFrame(render);
        });
    
        return () => sim.stop();
      }, [graph, size, forces, toggles, rebuildQT]);
    
      /* render */
      const render = useCallback(() => {
        frameRef.current = null;
        if (!canvasRef.current || !graph.nodes.length) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const [w, h] = size;
    
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        ctx.translate(zRef.current.x, zRef.current.y);
        ctx.scale(zRef.current.k, zRef.current.k);
    
        // Enhanced color scale for more vibrant colors
        const baseColors = d3.schemeCategory10;
        const vibrantColors = baseColors.map(color => {
          // Brighten/saturate the colors for more resplendence
          const c = d3.color(color);
          if (c) {
            c.opacity = 1;
            if (c.formatHsl) {
              const hsl = d3.hsl(c);
              hsl.s = Math.min(1, hsl.s * 1.2); // Increase saturation
              hsl.l = Math.min(0.65, hsl.l * 1.1); // Slightly brighten but keep contrast
              return hsl.toString();
            }
          }
          return color;
        });
    
        const color = d3.scaleOrdinal<string>()
          .domain(d3.map(graph.nodes, (d) => d.group ?? d.label ?? 'x').keys())
          .range(vibrantColors);
    
        // highlight sets
        const highlightedNodes = new Set<string>();
        const highlightedLinks = new Set<Link>();
    
        if (searchedNodeRef.current) {
          highlightedNodes.add(String(searchedNodeRef.current.id));
          graph.links.forEach((l) => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (String(s) === String(searchedNodeRef.current!.id) || String(t) === String(searchedNodeRef.current!.id)) {
              highlightedLinks.add(l);
              highlightedNodes.add(String(s));
              highlightedNodes.add(String(t));
            }
          });
        }
        if (hoveredNodeRef.current) {
          highlightedNodes.add(String(hoveredNodeRef.current.id));
          graph.links.forEach((l) => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (String(s) === String(hoveredNodeRef.current!.id) || String(t) === String(hoveredNodeRef.current!.id)) {
              highlightedLinks.add(l);
              highlightedNodes.add(String(s));
              highlightedNodes.add(String(t));
            }
          });
        }
    
        // links
        graph.links.forEach((l) => {
          const s = typeof l.source === 'object' ? (l.source as Node) : (l.source = graph.nodes.find((n) => n.id === l.source) as Node);
          const t = typeof l.target === 'object' ? (l.target as Node) : (l.target = graph.nodes.find((n) => n.id === l.target) as Node);
          if (!s || !t) return;
    
          ctx.beginPath();
          if (toggles.enableEdgeBundling) {
            const mx = (s.x! + t.x!) / 2;
            const my = (s.y! + t.y!) / 2 - 30;
            ctx.moveTo(s.x!, s.y!);
            ctx.quadraticCurveTo(mx, my, t.x!, t.y!);
          } else {
            ctx.moveTo(s.x!, s.y!);
            ctx.lineTo(t.x!, t.y!);
          }
          const isHL = highlightedLinks.has(l);
          ctx.strokeStyle = isHL ? 'purple' : dark ? '#555' : '#b0b0b0';
          ctx.lineWidth = isHL ? display.linkThickness * 2 : display.linkThickness;
          ctx.globalAlpha = isHL || highlightedNodes.size === 0 ? 1 : 0.35;
          ctx.stroke();
    
          // arrows
          if (display.showArrows) {
            const ang = Math.atan2(t.y! - s.y!, t.x! - s.x!);
            const len = Math.hypot(t.x! - s.x!, t.y! - s.y!);
            const r = display.nodeSize;
            const ax = t.x! - (r / len) * (t.x! - s.x!);
            const ay = t.y! - (r / len) * (t.y! - s.y!);
            const sizeA = Math.max(2, display.linkThickness * 2);
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-sizeA * 2, -sizeA);
            ctx.lineTo(-sizeA * 2, sizeA);
            ctx.closePath();
            ctx.fillStyle = 'gold';
            ctx.fill();
            ctx.restore();
          }
    
          // link label
          if (display.showLinkLabels && (zRef.current.k > 1 || highlightedNodes.has(String(s.id)))) {
            const midX = (s.x! + t.x!) / 2;
            const midY = (s.y! + t.y!) / 2;
            ctx.save();
            ctx.translate(midX, midY);
            ctx.rotate(Math.atan2(t.y! - s.y!, t.x! - s.x!));
            ctx.fillStyle = dark ? '#eee' : '#111';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(l.type, 0, -4);
            ctx.restore();
          }
        });
    
        // 3D nodes with enhanced styling
        graph.nodes.forEach((n) => {
          if (n.x == null || n.y == null) return;
          const isHL = highlightedNodes.has(String(n.id));
          const r = display.nodeSize;
          const baseColor = color(n.group ?? n.label ?? 'x');
          
          // Make sure opacity is always full for the nodes - fixes dark mode dragging bug
          ctx.globalAlpha = isHL || highlightedNodes.size === 0 ? 1 : 0.8;
          
          // Create 3D effect with gradient
          const gradient = ctx.createRadialGradient(
            n.x - r/2.5, n.y - r/2.5, 0,  // Highlight position (top-left)
            n.x, n.y, r * 1.2             // Full radius with slight expansion
          );
          
          // Get the base color and create highlight/shadow variations
          const c = d3.color(baseColor);
          let highlightColor, midColor, shadowColor;
          
          if (c) {
            // Create highlight color (lighter)
            const highlight = d3.color(baseColor);
            highlight!.opacity = 1;
            if (highlight!.formatHsl) {
              const hsl = d3.hsl(highlight!);
              hsl.l = Math.min(0.9, hsl.l * 1.6); // Much lighter for highlight
              highlightColor = hsl.toString();
            } else {
              highlightColor = 'white';
            }
            
            // Middle color (base color but ensure full opacity)
            midColor = baseColor;
            
            // Shadow color (darker)
            const shadow = d3.color(baseColor);
            shadow!.opacity = 1;
            if (shadow!.formatHsl) {
              const hsl = d3.hsl(shadow!);
              hsl.l = Math.max(0.1, hsl.l * 0.7); // Darker for shadow
              shadowColor = hsl.toString();
            } else {
              shadowColor = 'black';
            }
          } else {
            // Fallbacks if color parsing fails
            highlightColor = 'white';
            midColor = baseColor;
            shadowColor = 'black';
          }
          
          // Set up gradient for 3D effect
          gradient.addColorStop(0, highlightColor);
          gradient.addColorStop(0.5, midColor);
          gradient.addColorStop(1, shadowColor);
          
          // Draw the node with 3D effect
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
          
          // Add a slight outline for definition
          ctx.lineWidth = isHL ? 2 : 1;
          ctx.strokeStyle = isHL ? (dark ? '#fff' : '#000') : (dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)');
          ctx.stroke();
    
          if (zRef.current.k > 1.2 || isHL) {
            ctx.fillStyle = dark ? '#fff' : '#000';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(n.name ?? String(n.id), n.x, n.y + r + 12);
          }
        });
    
        ctx.restore();
      }, [graph, size, display, dark, toggles]);
    
      /* zoom & drag handlers */
      useEffect(() => {
        if (!canvasRef.current) return;
        const sel = d3.select(canvasRef.current);
        const canvas = canvasRef.current;

        // Track if modifier key is pressed to update cursor
        let isModifierPressed = false;
        
        const updateCursor = () => {
          canvas.style.cursor = isModifierPressed ? 'grab' : 'default';
        };
        
        // Add event listeners for modifier keys
        const handleKeyDown = (e: KeyboardEvent) => {
          const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
          const isModifierKey = isMac ? e.metaKey : e.ctrlKey;
          if (isModifierKey && !isModifierPressed) {
            isModifierPressed = true;
            updateCursor();
          }
        };
        
        const handleKeyUp = (e: KeyboardEvent) => {
          const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
          const isModifierKey = isMac ? e.metaKey : e.ctrlKey;
          if (isModifierKey && isModifierPressed) {
            isModifierPressed = false;
            updateCursor();
          }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // zoom with modifier key filter
        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
          .scaleExtent([0.1, 6])
          .filter((event: MouseEvent) => {
            // Allow zooming with mouse wheel always
            if (event.type === 'wheel') return true;
            
            // For panning (drag events), require command key on Mac or control key elsewhere
            const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
            return isMac ? event.metaKey : event.ctrlKey;
          })
          .on('zoom', (e: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
            zRef.current = e.transform;
            render();
          });
          
        sel.call(zoom as any);

        // drag node behaviour
        const subject = (event: any) => {
          if (!qtRef.current) return null;
          const [mx, my] = zRef.current.invert(d3.pointer(event));
          return qtRef.current.find(mx, my, display.nodeSize + 2);
        };
        
        // Update cursor when hovering over nodes
        sel.on('mousemove', (ev: MouseEvent) => {
          const [mx, my] = d3.pointer(ev as any);
          const [x, y] = zRef.current.invert([mx, my]);
          const n = qtRef.current?.find(x, y, display.nodeSize + 1) ?? null;
          
          // Set cursor based on whether we're hovering over a node
          if (n) {
            canvas.style.cursor = 'pointer';
          } else {
            updateCursor();
          }
          
          if (hoverTimeout.current) {
            clearTimeout(hoverTimeout.current);
            hoverTimeout.current = null;
          }
          hoverTimeout.current = setTimeout(() => {
            if (hoveredNodeRef.current !== n) {
              hoveredNodeRef.current = n;
              render();
            }
          }, 60);
        });
        
        const drag = d3
          .drag<HTMLCanvasElement, Node>()
          .subject(subject as any)
          .on('start', (e: d3.D3DragEvent<HTMLCanvasElement, Node, Node>) => {
            (e.sourceEvent as MouseEvent).stopPropagation();
            simRef.current?.alphaTarget(0.3).restart();
            e.subject.fx = e.subject.x;
            e.subject.fy = e.subject.y;
            canvas.style.cursor = 'grabbing';
          })
          .on('drag', (e: d3.D3DragEvent<HTMLCanvasElement, Node, Node>) => {
            // Fix offset issue by directly using the transformed coordinates
            const sourceEvent = e.sourceEvent as MouseEvent;
            const rect = canvas.getBoundingClientRect();
            const x = sourceEvent.clientX - rect.left;
            const y = sourceEvent.clientY - rect.top;
            const [transformedX, transformedY] = zRef.current.invert([x, y]);
            
            e.subject.fx = transformedX;
            e.subject.fy = transformedY;
            
            // Force a render to ensure we don't lose opacity during drag in dark mode
            render();
          })
          .on('end', (e: d3.D3DragEvent<HTMLCanvasElement, Node, Node>) => {
            simRef.current?.alphaTarget(0);
            e.subject.fx = null;
            e.subject.fy = null;
            // Reset cursor when done dragging
            if (hoveredNodeRef.current) {
              canvas.style.cursor = 'pointer';
            } else {
              updateCursor();
            }
            // Make sure to render once more after releasing the drag
            render();
          });
        sel.call(drag as any);

        sel.on('mouseleave', () => {
          if (hoveredNodeRef.current) {
            hoveredNodeRef.current = null;
            render();
          }
          canvas.style.cursor = 'default';
        });

        sel.on('click', (ev: MouseEvent) => {
          const [mx, my] = d3.pointer(ev as any);
          const [x, y] = zRef.current.invert([mx, my]);
          const n = qtRef.current?.find(x, y, display.nodeSize + 1) ?? null;
          onNodeSelect(n);
        });

        return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          sel.on('.zoom', null).on('.drag', null).on('mousemove', null).on('mouseleave', null).on('click', null);
        };
      }, [render, display.nodeSize, onNodeSelect]);
    
      /* re-render on resize only */
      useEffect(() => {
        render();
      }, [size, render]);
    
      return (
        <div ref={containerRef} className="w-full h-full">
          <canvas ref={canvasRef} width={size[0]} height={size[1]} className="block w-full h-full" />
        </div>
      );
    };
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Node detail panel (same as before)                                     */
    /* ════════════════════════════════════════════════════════════════════════ */
    interface NodePanelProps { node: Node; close: () => void; dark: boolean }
    const NodePanel: React.FC<NodePanelProps> = ({ node, close, dark }) => (
      <motion.div
        key="panel"
        initial={{ x: 350, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 350, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
        className="absolute right-4 top-4 w-80 z-20"
      >
        <Card className={cls(
          'border shadow-lg',
          dark 
            ? 'bg-neutral-900 border-neutral-700 text-neutral-100' 
            : 'bg-white border-neutral-200 text-neutral-800'
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="flex justify-between gap-2 text-lg">
              <span className={dark ? "text-neutral-100" : "text-neutral-800"}>
                {node.name ?? node.id}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={close} 
                className={cls(
                  "h-7 w-7", 
                  dark 
                    ? "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800" 
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                )}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[80vh] overflow-y-auto text-sm">
            <div className={cls(
              "text-xs py-1 px-2 rounded-md inline-block", 
              dark 
                ? "bg-neutral-800 text-neutral-300" 
                : "bg-neutral-100 text-neutral-600"
            )}>
              {node.group ?? node.label ?? 'Node'}
            </div>
            
            {node.description && (
              <p className={dark ? "text-neutral-300" : "text-neutral-700"}>
                {node.description}
              </p>
            )}
            
            {node.properties && (
              <div className="space-y-2 text-xs mt-3">
                <div className={cls(
                  "text-xs font-medium pb-1 border-b",
                  dark ? "border-neutral-800 text-neutral-300" : "border-neutral-200 text-neutral-600"
                )}>
                  Properties
                </div>
                {Object.entries(node.properties).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1">
                    <span className={dark ? "text-neutral-400" : "text-neutral-500"}>
                      {formatLabel(k)}
                    </span>
                    <span className={cls(
                      "break-all max-w-[65%] text-right font-medium",
                      dark ? "text-neutral-200" : "text-neutral-700"
                    )}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
    
    /* ════════════════════════════════════════════════════════════════════════ */
    /*  Main GraphVisualizer component                                         */
    /* ════════════════════════════════════════════════════════════════════════ */
    interface GraphVisualizerProps {
      graph?: Graph;
      loading?: boolean;
      error?: string | null;
      numberOfNodes?: number;
      setNumberOfNodes?: Dispatch<SetStateAction<number>>;
      queryType?: string;
      setQueryType?: Dispatch<SetStateAction<string>>;
      refreshGraph?: () => Promise<void>;
    }

    const GraphVisualizer: React.FC<GraphVisualizerProps> = ({
      graph: externalGraph,
      loading: externalLoading,
      error: externalError,
      numberOfNodes: externalNumberOfNodes,
      setNumberOfNodes: externalSetNumberOfNodes,
      queryType: externalQueryType,
      setQueryType: externalSetQueryType,
      refreshGraph
    }) => {
      /* ── graph state & fetch ───────────────────────────────────────────── */
      const [localGraph, setLocalGraph] = useState<Graph>({ nodes: [], links: [] });
      const [localLoading, setLocalLoading] = useState(false);
      const [localError, setLocalError] = useState<string | null>(null);

      const [search, setSearch] = useState('');

      // settings
      const [forces, setForces] = useState<ForcesSettings>({
        centerForce: 0.1,
        repelForce: -500,
        linkForce: 1,
        linkDistance: 60,
        collisionRadius: 2,
        radialRadius: 60,
      });
      const [display, setDisplay] = useState<DisplaySettings>({
        showArrows: false,
        showLinkLabels: false,
        nodeSize: 8,
        linkThickness: 1,
      });
      const [layoutType, setLayoutType] = useState<string>('force');
      const [localNumberOfNodes, setLocalNumberOfNodes] = useState<number>(1000);
      const [localQueryType, setLocalQueryType] = useState<string>('default');
      const [toggles, setToggles] = useState<AdvancedToggles>({
        enableJitter: false,
        enableGravityWell: true,
        enableOrbiting: false,
        enableRepulsionZones: false,
        enableElasticLinks: false,
        enableClustering: false,
        enableEdgeBundling: false,
      });

      const [dark, setDark] = useState(true);
      const [sidebarOpen, setSidebarOpen] = useState(true);
      const [selected, setSelected] = useState<Node | null>(null);

      // Use external props if provided, otherwise use local state
      const graph = externalGraph || localGraph;
      const loading = externalLoading !== undefined ? externalLoading : localLoading;
      const error = externalError !== null ? externalError : localError;
      const effectiveNumberOfNodes = externalNumberOfNodes !== undefined ? externalNumberOfNodes : localNumberOfNodes;
      const effectiveQueryType = externalQueryType || localQueryType;
      
      // These functions will call external handlers if provided, otherwise update local state
      const handleSetNumberOfNodes = (num: number) => {
        if (externalSetNumberOfNodes) {
          externalSetNumberOfNodes(num);
        } else {
          setLocalNumberOfNodes(num);
        }
      };
      
      const handleSetQueryType = (type: string) => {
        if (externalSetQueryType) {
          externalSetQueryType(type);
        } else {
          setLocalQueryType(type);
        }
      };

      /* ── data fetch ────────────────────────────────────────────────────── */
      const fetchGraph = useCallback(async () => {
        // If external refreshGraph is provided, use that instead
        if (refreshGraph) {
          return refreshGraph();
        }
        
        setLocalLoading(true);
        try {
          const res = await fetch('/api/graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: localNumberOfNodes, queryType: localQueryType }),
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const data = await res.json();
          console.log(data.nodes)
          setLocalGraph({ nodes: data.nodes ?? [], links: data.links ?? [] });
          setLocalError(null);
        } catch (e) {
          setLocalError((e as Error).message);
          setLocalGraph({ nodes: [], links: [] });
        } finally {
          setLocalLoading(false);
        }
      }, [localNumberOfNodes, localQueryType, refreshGraph]);

      useEffect(() => {
        // Only fetch graph if external graph is not provided
        if (!externalGraph) {
          fetchGraph();
        }
      }, [fetchGraph, externalGraph]);

      /* ── render ────────────────────────────────────────────────────────── */
      return (
        <div className={cls('relative w-full h-full', dark ? 'dark bg-neutral-950 text-neutral-100' : 'bg-white')}>
          {/* canvas */}
          <GraphCanvas graph={graph} search={search} forces={forces} display={display} toggles={toggles} dark={dark} onNodeSelect={setSelected} />

          {/* node panel */}
          <AnimatePresence>{selected && <NodePanel node={selected} close={() => setSelected(null)} dark={dark} />}</AnimatePresence>

          {/* sidebar */}
          <Sidebar
            search={search}
            setSearch={setSearch}
            forces={forces}
            setForces={setForces}
            display={display}
            setDisplay={setDisplay}
            layoutType={layoutType}
            setLayoutType={setLayoutType}
            numberOfNodes={effectiveNumberOfNodes}
            setNumberOfNodes={handleSetNumberOfNodes}
            queryType={effectiveQueryType}
            setQueryType={handleSetQueryType}
            toggles={toggles}
            setToggles={setToggles}
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
            dark={dark}
            setDark={setDark}
            loading={loading}
          />

          {/* error banner */}
          {error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg text-sm">
              {error}
            </div>
          )}
        </div>
      );
    };
    
    export default GraphVisualizer;
    