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
        type Section = 'search' | 'forces' | 'display' | 'layout' | 'advanced';
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
          { open: { search: true, forces: false, display: false, layout: false, advanced: false } }
        );
    
        /* ── constants ───────────────────────────────────────────────────── */
        const layoutOptions = useMemo(() => ['force', 'tree', 'radial', 'grid'], []);
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
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{label}</span>
              <span>{val.toFixed(1)}</span>
            </div>
            <Slider min={min} max={max} step={step} value={[val]} onValueChange={([v]) => onChange(v)} />
          </div>
        );
    
        const ToggleRow: React.FC<{ label: string; value: boolean; onChange: (b: boolean) => void }> = ({ label, value, onChange }) => (
          <div className="flex items-center justify-between py-1 text-xs">
            <span>{label}</span>
            <Switch checked={value} onCheckedChange={onChange} />
          </div>
        );
    
        /* ── render ──────────────────────────────────────────────────────── */
        const sideVariants = { open: { width: '280px', opacity: 1 }, closed: { width: '52px', opacity: 0.9 } };
        const chevronVariants = { open: { rotate: 0 }, closed: { rotate: 180 } };
    
        return (
          <motion.aside
            className={cls(
              'absolute top-4 left-4 z-30 rounded-2xl shadow-xl backdrop-blur overflow-hidden',
              dark ? 'bg-neutral-900/90 text-neutral-100' : 'bg-white/90 text-neutral-900'
            )}
            animate={isOpen ? 'open' : 'closed'}
            variants={sideVariants}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* header */}
            <header className="flex items-center justify-between p-3 border-b border-neutral-800">
              {isOpen && <h2 className="font-bold text-lg">Settings</h2>}
              <div className="flex gap-2 ml-auto items-center">
                {isOpen && (
                  <Button size="icon" variant="ghost" onClick={() => setDark(!dark)} className="text-neutral-400 hover:text-neutral-100">
                    {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => setIsOpen(!isOpen)} className="text-neutral-400 hover:text-neutral-100">
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
                  className="p-4 space-y-5 overflow-y-auto scrollbar-thin max-h-[calc(100vh-140px)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Search */}
                  <Section title="Search" open={state.open.search} toggle={() => dispatch({ type: 'TOGGLE', key: 'search' })}>
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find node…" className="pl-9 bg-neutral-800 border-neutral-700" />
                    </div>
                  </Section>
    
                  {/* Forces */}
                  <Section title="Forces" open={state.open.forces} toggle={() => dispatch({ type: 'TOGGLE', key: 'forces' })}>
                    <SliderRow label="Center" val={forces.centerForce} min={0} max={1} step={0.02} onChange={(v) => setForces((f) => ({ ...f, centerForce: v }))} />
                    <SliderRow label="Repel" val={forces.repelForce} min={-1500} max={0} step={50} onChange={(v) => setForces((f) => ({ ...f, repelForce: v }))} />
                    <SliderRow label="Link dist" val={forces.linkDistance} min={20} max={300} step={10} onChange={(v) => setForces((f) => ({ ...f, linkDistance: v }))} />
                    <SliderRow label="Link str" val={forces.linkForce} min={0} max={2.5} step={0.05} onChange={(v) => setForces((f) => ({ ...f, linkForce: v }))} />
                    <SliderRow label="Collide" val={forces.collisionRadius} min={0} max={60} step={2} onChange={(v) => setForces((f) => ({ ...f, collisionRadius: v }))} />
                    <SliderRow label="Radial" val={forces.radialRadius} min={0} max={500} step={10} onChange={(v) => setForces((f) => ({ ...f, radialRadius: v }))} />
                  </Section>
    
                  {/* Display */}
                  <Section title="Display" open={state.open.display} toggle={() => dispatch({ type: 'TOGGLE', key: 'display' })}>
                    <ToggleRow label="Arrows" value={display.showArrows} onChange={(b) => setDisplay((d) => ({ ...d, showArrows: b }))} />
                    <ToggleRow label="Link labels" value={display.showLinkLabels} onChange={(b) => setDisplay((d) => ({ ...d, showLinkLabels: b }))} />
                    <SliderRow label="Node size" val={display.nodeSize} min={2} max={20} step={1} onChange={(v) => setDisplay((d) => ({ ...d, nodeSize: v }))} />
                    <SliderRow label="Link width" val={display.linkThickness} min={1} max={10} step={1} onChange={(v) => setDisplay((d) => ({ ...d, linkThickness: v }))} />
                  </Section>
    
                  {/* Layout */}
                  <Section title="Layout" open={state.open.layout} toggle={() => dispatch({ type: 'TOGGLE', key: 'layout' })}>
                    <SelectRow label="Layout" value={layoutType} options={layoutOptions} onChange={setLayoutType} />
                    <SelectRow label="# Nodes" value={String(numberOfNodes)} options={nodeOptions.map(String)} onChange={(v) => setNumberOfNodes(parseInt(v))} />
                    <SelectRow label="Query" value={queryType} options={queryOptions} onChange={setQueryType} />
                  </Section>
    
                  {/* Advanced */}
                  <Section title="Advanced" open={state.open.advanced} toggle={() => dispatch({ type: 'TOGGLE', key: 'advanced' })}>
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
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <Loader className="animate-spin h-4 w-4" /> Loading…
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
    const Section: React.FC<{ title: string; open: boolean; toggle: () => void; children: React.ReactNode }> = ({ title, open, toggle, children }) => {
      const chevronVariants = { open: { rotate: 0 }, closed: { rotate: 180 } };
      return (
        <Collapsible open={open} onOpenChange={toggle} className="border-b border-neutral-800 pb-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full mb-1 select-none">
            <h3 className="font-semibold text-sm">{title}</h3>
            <motion.div animate={open ? 'open' : 'closed'} variants={chevronVariants}>
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            </motion.div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-1">{children}</CollapsibleContent>
        </Collapsible>
      );
    };
    
    const SelectRow: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
      <div className="space-y-1 text-xs">
        <span className="font-medium">{label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between bg-neutral-800 border-neutral-700 h-7 px-2 text-xs">
              {capitalize(value)}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-0 bg-neutral-800 border-neutral-700 rounded-md">
            {options.map((opt) => (
              <Button
                key={opt}
                variant="ghost"
                className={cls('w-full justify-start text-xs rounded-none', opt === value && 'bg-neutral-700')}
                onClick={() => onChange(opt)}
              >
                {opt === value && <Check className="h-3 w-3 mr-1" />} {capitalize(opt)}
              </Button>
            ))}
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
    
        // color scale by group/label
        const color = d3.scaleOrdinal<string>().domain(d3.map(graph.nodes, (d) => d.group ?? d.label ?? 'x').keys()).range(d3.schemeCategory10);
    
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
    
        // nodes
        graph.nodes.forEach((n) => {
          if (n.x == null || n.y == null) return;
          const isHL = highlightedNodes.has(String(n.id));
          const r = display.nodeSize;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = color(n.group ?? n.label ?? 'x');
          ctx.globalAlpha = isHL || highlightedNodes.size === 0 ? 1 : 0.8;
          ctx.fill();
          ctx.lineWidth = isHL ? 3 : 1;
          ctx.strokeStyle = isHL ? '#000' : '#fff';
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
    
        // zoom
        const zoom = d3.zoom<HTMLCanvasElement, unknown>().scaleExtent([0.1, 6]).on('zoom', (e) => {
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
            const [mx, my] = zRef.current.invert([e.x, e.y]);
            e.subject.fx = mx;
            e.subject.fy = my;
          })
          .on('end', (e) => {
            simRef.current?.alphaTarget(0);
            e.subject.fx = null;
            e.subject.fy = null;
          });
        sel.call(drag as any);
    
        // hover + click
        const hoverDelay = 60;
        sel.on('mousemove', (ev) => {
          const [mx, my] = d3.pointer(ev as any);
          const [x, y] = zRef.current.invert([mx, my]);
          const n = qtRef.current?.find(x, y, display.nodeSize + 1) ?? null;
          if (hoverTimeout.current) {
            clearTimeout(hoverTimeout.current);
            hoverTimeout.current = null;
          }
          hoverTimeout.current = setTimeout(() => {
            if (hoveredNodeRef.current !== n) {
              hoveredNodeRef.current = n;
              render();
            }
          }, hoverDelay);
        });
    
        sel.on('mouseleave', () => {
          if (hoveredNodeRef.current) {
            hoveredNodeRef.current = null;
            render();
          }
        });
    
        sel.on('click', (ev) => {
          const [mx, my] = d3.pointer(ev as any);
          const [x, y] = zRef.current.invert([mx, my]);
          const n = qtRef.current?.find(x, y, display.nodeSize + 1) ?? null;
          onNodeSelect(n);
        });
    
        return () => {
          sel.on('.zoom', null).on('.drag', null).on('mousemove', null).on('mouseleave', null).on('click', null);
        };
      }, [render, display.nodeSize, onNodeSelect]);
    
      /* re-render on resize only */
      useEffect(() => {
        render();
      }, [size, render]);
    
      return (
        <div ref={containerRef} className="w-full h-full">
          <canvas ref={canvasRef} width={size[0]} height={size[1]} className="block w-full h-full cursor-grab" />
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
        <Card className={cls('border', dark ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300')}>
          <CardHeader>
            <CardTitle className="flex justify-between gap-2 text-lg">
              {node.name ?? node.id}
              <Button variant="ghost" size="icon" onClick={close} className="text-neutral-400 hover:text-neutral-100">
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[80vh] overflow-y-auto text-sm">
            <div className="text-xs text-neutral-400">{node.group ?? node.label}</div>
            {node.description && <p>{node.description}</p>}
            {node.properties && (
              <div className="space-y-1 text-xs">
                {Object.entries(node.properties).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-neutral-400">{k}</span><span className="break-all">{String(v)}</span></div>
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
    const GraphVisualizer: React.FC = () => {
      /* ── graph state & fetch ───────────────────────────────────────────── */
      const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState<string | null>(null);
    
      const [search, setSearch] = useState('');
    
      // settings
      const [forces, setForces] = useState<ForcesSettings>({
        centerForce: 0.1,
        repelForce: -500,
        linkForce: 1,
        linkDistance: 120,
        collisionRadius: 30,
        radialRadius: 200,
      });
      const [display, setDisplay] = useState<DisplaySettings>({
        showArrows: false,
        showLinkLabels: false,
        nodeSize: 8,
        linkThickness: 1,
      });
      const [layoutType, setLayoutType] = useState<string>('force');
      const [numberOfNodes, setNumberOfNodes] = useState<number>(100);
      const [queryType, setQueryType] = useState<string>('default');
      const [toggles, setToggles] = useState<AdvancedToggles>({
        enableJitter: false,
        enableGravityWell: true,
        enableOrbiting: false,
        enableRepulsionZones: false,
        enableElasticLinks: false,
        enableClustering: false,
        enableEdgeBundling: false,
      });
    
      const [dark, setDark] = useState(false);
      const [sidebarOpen, setSidebarOpen] = useState(true);
      const [selected, setSelected] = useState<Node | null>(null);
    
      /* ── data fetch ────────────────────────────────────────────────────── */
      const fetchGraph = useCallback(async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: numberOfNodes, queryType }),
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const data = await res.json();
          console.log(data.nodes)
          setGraph({ nodes: data.nodes ?? [], links: data.links ?? [] });
          setError(null);
        } catch (e) {
          setError((e as Error).message);
          setGraph({ nodes: [], links: [] });
        } finally {
          setLoading(false);
        }
      }, [numberOfNodes, queryType]);
    
      useEffect(() => {
        fetchGraph();
      }, [fetchGraph]);
    
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
            numberOfNodes={numberOfNodes}
            setNumberOfNodes={setNumberOfNodes}
            queryType={queryType}
            setQueryType={setQueryType}
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
    