// ForceDirectedGraph.tsx

import React, {
    useRef,
    useState,
    useEffect,
    useLayoutEffect,
    useCallback,
    useMemo,
    Dispatch,
    SetStateAction,
  } from 'react';
  import * as d3 from 'd3';
  import { AnimatePresence, motion } from 'framer-motion';
  import { X } from 'lucide-react';
  import { Button } from '../ui/button';
  import { Card, CardContent } from '../ui/card';
  import {
    TooltipProvider,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
  } from '../ui/tooltip';
  
  // Interface definitions
  interface Node {
    id: string;
    name: string;
    group: string;
    description?: string;
    connections?: Array<{ name: string; strength: number }>;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    vx?: number;
    vy?: number;
    properties?: any;
    labels?: string[];
  }
  
  interface Link {
    source: string | Node;
    target: string | Node;
    value: number;
    type: string;
    index?: number;
  }
  
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
  
  interface ForceDirectedGraphProps {
    data: {
      nodes: Node[];
      links: Link[];
    };
    setNumberOfNodes: Dispatch<SetStateAction<number>>;
    defaultGraphSettings: {
      forcesSettings: ForcesSettings;
      displaySettings: DisplaySettings;
    };
    queryType: string;
    setQueryType: Dispatch<SetStateAction<string>>;
    numberOfNodes: number;
    onNodeSelect: (node: Node | null) => void;
    isDarkMode: boolean;
    layoutType: string;
    forces: ForcesSettings;
    displaySettings: DisplaySettings;
    enableJitter: boolean;
    enableGravityWell: boolean;
    enableOrbiting: boolean;
    enableRepulsionZones: boolean;
    enableElasticLinks: boolean;
    enableClustering: boolean;
    enableEdgeBundling: boolean;
    searchedNodeRef: Node | null;
    setSearchedNodeRef: Dispatch<SetStateAction<Node | null>>;
    searchTerm: string;
  }
  
  const ForceDirectedGraph: React.FC<ForceDirectedGraphProps> = ({
    data,
    setNumberOfNodes,
    defaultGraphSettings,
    queryType,
    setQueryType,
    numberOfNodes,
    onNodeSelect,
    isDarkMode,
    layoutType,
    forces,
    displaySettings,
    enableJitter,
    enableGravityWell,
    enableOrbiting,
    enableRepulsionZones,
    enableElasticLinks,
    enableClustering,
    enableEdgeBundling,
    searchedNodeRef,
    setSearchedNodeRef,
    searchTerm,
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  
    const [width, setWidth] = useState<number>(0);
    const [height, setHeight] = useState<number>(0);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [rootNode, setRootNode] = useState<Node | null>(null);
    const [currentDepth, setCurrentDepth] = useState<number>(1);
    const [inMode, setInMode] = useState<boolean>(false);
    const [showPopup, setShowPopup] = useState<boolean>(false);
  
    const hoveredNodeRef = useRef<Node | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hoverDelay = 75; // Hover delay in milliseconds
  
    // Update width and height using ResizeObserver
    useLayoutEffect(() => {
      if (!containerRef.current) return;
  
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: containerWidth, height: containerHeight } = entry.contentRect;
          setWidth(containerWidth);
          setHeight(containerHeight);
        }
      });
  
      resizeObserver.observe(containerRef.current);
  
      return () => {
        resizeObserver.disconnect();
      };
    }, []);
  
    // Prepare nodes, links, and nodeMap
    const { nodes, links, nodeMap } = useMemo(() => {
      const nodes: Node[] = [];
      const links: Link[] = [];
      const nodeMap = new Map<string, Node>();
  
      if (data?.nodes?.length) {
        data.nodes.forEach((nodeData) => {
          const newNode: Node = {
            id: nodeData.id,
            name: nodeData.properties?.name || 'Unknown',
            group: nodeData.labels?.[0] || 'Unknown',
            ...nodeData,
          };
          nodeMap.set(nodeData.id, newNode);
          nodes.push(newNode);
        });
      }
  
      if (data?.links?.length) {
        data.links.forEach((linkData) => {
          const newLink: Link = {
            source: typeof linkData.source === 'string' ? linkData.source : linkData.source.id,
            target: typeof linkData.target === 'string' ? linkData.target : linkData.target.id,
            value: 1,
            type: linkData.type || '',
          };
          links.push(newLink);
        });
      }
  
      return { nodes, links, nodeMap };
    }, [data]);
  
    // Subgraph fetching logic
    const getSubgraph = useCallback(
      (rootNode: Node, depth: number): { nodes: Node[]; links: Link[] } => {
        const visitedNodes = new Set<string>();
        const displayedNodes: Node[] = [];
        const displayedLinks: Link[] = [];
  
        const queue: { node: Node; depth: number }[] = [{ node: rootNode, depth: 0 }];
        visitedNodes.add(rootNode.id);
        displayedNodes.push(rootNode);
  
        while (queue.length > 0) {
          const { node, depth: currentDepth } = queue.shift()!;
          if (currentDepth >= depth) continue;
  
          links.forEach((link) => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
  
            let neighborId: string | null = null;
  
            if (sourceId === node.id && !visitedNodes.has(targetId)) {
              neighborId = targetId;
            } else if (targetId === node.id && !visitedNodes.has(sourceId)) {
              neighborId = sourceId;
            }
  
            if (neighborId) {
              const neighborNode = nodeMap.get(neighborId);
              if (neighborNode) {
                visitedNodes.add(neighborId);
                displayedNodes.push(neighborNode);
                displayedLinks.push(link);
                queue.push({ node: neighborNode, depth: currentDepth + 1 });
              }
            }
          });
        }
  
        return { nodes: displayedNodes, links: displayedLinks };
      },
      [links, nodeMap]
    );
  
    // Determine displayed nodes and links based on mode
    const { displayedNodes, displayedLinks } = useMemo(() => {
      if (rootNode && inMode) {
        const subgraph = getSubgraph(rootNode, currentDepth);
        return {
          displayedNodes: subgraph.nodes,
          displayedLinks: subgraph.links,
        };
      } else {
        return {
          displayedNodes: nodes,
          displayedLinks: links,
        };
      }
    }, [nodes, links, rootNode, inMode, currentDepth, getSubgraph]);
  
    // Color scale for node groups
    const colorScale = useMemo(() => {
      const groups = [...new Set(nodes.map((node) => node.group))];
      const colors = ['#0066FF', '#FF3300', '#FFD700', '#33CC00'];
      return d3.scaleOrdinal<string, string>().domain(groups).range(colors);
    }, [nodes]);
  
    // D3 Visualization logic
    useEffect(() => {
      if (!canvasRef.current || width === 0 || height === 0) return;
  
      const canvas = d3.select(canvasRef.current).style('display', 'block').style('margin', '0 auto');
      const context = canvasRef.current.getContext('2d');
      if (!context) return;
  
      const labelZoomThreshold = 0.75;
      const useSimpleCircles = !inMode;
  
      // Load images if necessary
      const images: { [key: string]: HTMLImageElement } = {};
      const loadImages = async () => {
        if (useSimpleCircles) return;
        const nodeSVGs: { [key: string]: string } = {
          Person: '/node-icons/person.svg',
          Institution: '/node-icons/university.svg',
          Ideology: '/node-icons/ideology.svg',
          Company: '/node-icons/company.svg',
        };
        const promises = Object.entries(nodeSVGs).map(([key, url]) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
              images[key] = img;
              resolve();
            };
            img.onerror = () => {
              console.error(`Failed to load image: ${url}`);
              resolve();
            };
          });
        });
        await Promise.all(promises);
      };
  
      loadImages().then(() => {
        // Initialize simulation
        if (!simulationRef.current) {
          simulationRef.current = d3.forceSimulation<Node, Link>(displayedNodes);
        }
  
        const simulation = simulationRef.current;
  
        // Update forces
        simulation.nodes(displayedNodes);
        simulation.force('link', null);
        simulation.force('charge', null);
        simulation.force('center', null);
        simulation.force('collision', null);
        simulation.force('xCluster', null);
        simulation.force('yCluster', null);
        simulation.force('gravityWell', null);
        simulation.force('jitter', null);
        simulation.force('radial', null);
  
        // Apply forces
        applyForces(simulation, forces, displayedLinks, enableElasticLinks, enableClustering, enableGravityWell, enableRepulsionZones, enableJitter, width, height);
  
        // Spatial indexing using quadtree
        let quadtree = d3
          .quadtree<Node>()
          .x((d) => d.x as number)
          .y((d) => d.y as number)
          .addAll(displayedNodes);
  
        // Simulation tick handler
        if (enableOrbiting) {
          let angle = 0;
          simulation.on('tick', () => {
            angle += 0.005;
            displayedNodes.forEach((node, i) => {
              const radius = 100 + i * 5;
              node.x = width / 2 + radius * Math.cos(angle + i);
              node.y = height / 2 + radius * Math.sin(angle + i);
            });
            quadtree = d3
              .quadtree<Node>()
              .x((d) => d.x as number)
              .y((d) => d.y as number)
              .addAll(displayedNodes);
            render();
          });
        } else {
          simulation.on('tick', () => {
            quadtree = d3
              .quadtree<Node>()
              .x((d) => d.x as number)
              .y((d) => d.y as number)
              .addAll(displayedNodes);
            render();
          });
        }
  
        // Start simulation
        simulation.alpha(1).restart();
  
        // Rendering
        let requestId: number | null = null;
        const render = () => {
          if (requestId) return;
          if (!context) return;
          requestId = requestAnimationFrame(() => {
            context.save();
            context.clearRect(0, 0, width, height);
  
            // Background
            context.fillStyle = isDarkMode ? 'black' : 'white';
            context.fillRect(0, 0, width, height);
  
            context.translate(transformRef.current.x, transformRef.current.y);
            context.scale(transformRef.current.k, transformRef.current.k);
  
            const highlightedNodes = new Set<string>();
            const highlightedLinks = new Set<Link>();
  
            // Handle search highlighting
            if (searchedNodeRef) {
              highlightedNodes.add(searchedNodeRef.id);
              displayedLinks.forEach((link) => {
                const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
                const targetId = typeof link.target === 'string' ? link.target : link.target.id;
  
                if (sourceId === searchedNodeRef.id || targetId === searchedNodeRef.id) {
                  highlightedLinks.add(link);
                  highlightedNodes.add(sourceId);
                  highlightedNodes.add(targetId);
                }
              });
            }
  
            // Handle hover highlighting
            if (hoveredNodeRef.current) {
              highlightedNodes.add(hoveredNodeRef.current.id);
              displayedLinks.forEach((link) => {
                const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
                const targetId = typeof link.target === 'string' ? link.target : link.target.id;
  
                if (sourceId === hoveredNodeRef.current.id || targetId === hoveredNodeRef.current.id) {
                  highlightedLinks.add(link);
                  highlightedNodes.add(sourceId);
                  highlightedNodes.add(targetId);
                }
              });
            }
  
            // Compute node colors
            const nodeColors: { [key: string]: string } = {};
            displayedNodes.forEach((d) => {
              nodeColors[d.id] = colorScale(d.group);
            });
  
            // Draw links
            drawLinks(
              context,
              displayedLinks,
              nodeMap,
              highlightedLinks,
              displaySettings,
              isDarkMode,
              highlightedNodes,
              enableEdgeBundling,
              transformRef.current.k,
              queryType
            );
  
            // Draw nodes
            drawNodes(
              context,
              displayedNodes,
              nodeColors,
              images,
              useSimpleCircles,
              displaySettings,
              isDarkMode,
              highlightedNodes,
              labelZoomThreshold,
              transformRef.current.k
            );
  
            context.restore();
            requestId = null;
          });
        };
  
        // Zoom and drag handlers
        const zoom = d3
          .zoom<HTMLCanvasElement, unknown>()
          .scaleExtent([0.1, 10])
          .on('zoom', zoomed);
        canvas.call(zoom as any);
  
        // Variables to track dragging threshold
        let initialX: number, initialY: number;
        const dragThreshold = 5; // Minimum movement in pixels to trigger dragging
  
        // Drag functions for nodes
        function dragsubject(event: d3.D3DragEvent<HTMLCanvasElement, unknown, unknown>) {
          const [x, y] = transformRef.current.invert(d3.pointer(event, canvasRef.current));
          return quadtree.find(x, y, displaySettings.nodeSize - 1);
        }
  
        function dragstarted(event: d3.D3DragEvent<HTMLCanvasElement, Node, Node>) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
  
          initialX = event.x;
          initialY = event.y;
  
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        }
  
        function dragged(event: d3.D3DragEvent<HTMLCanvasElement, Node, Node>) {
          const dx = Math.abs(event.x - initialX);
          const dy = Math.abs(event.y - initialY);
  
          if (dx > dragThreshold || dy > dragThreshold) {
            const [x, y] = transformRef.current.invert(d3.pointer(event, canvasRef.current));
            event.subject.fx = x;
            event.subject.fy = y;
          }
        }
  
        function dragended(event: d3.D3DragEvent<HTMLCanvasElement, Node, Node>) {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }
  
        // Initialize drag behavior
        const drag = d3
          .drag<HTMLCanvasElement, Node>()
          .subject((event) => dragsubject(event) as Node | d3.SubjectPosition)
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended);
  
        // Apply the drag behavior to the canvas
        canvas.call(drag as any);
  
        // Event handlers
        canvas.on('click', handleClick);
        canvas.on('dblclick', handleDoubleClick);
        canvas.on('mousemove', handleMouseMove);
        canvas.on('mouseleave', handleMouseLeave);
  
        function zoomed(event: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) {
          transformRef.current = event.transform;
          render();
        }
  
        function handleClick(event: MouseEvent) {
          const [mouseX, mouseY] = d3.pointer(event, canvasRef.current);
          const [x, y] = transformRef.current.invert([mouseX, mouseY]);
  
          const interactionRadius = displaySettings.nodeSize / transformRef.current.k;
  
          const node = quadtree.find(x, y, interactionRadius);
          if (node) {
            onNodeSelect(node);
            setSelectedNode(node);
            simulation.alphaTarget(0);
          }
        }
  
        function handleDoubleClick(event: MouseEvent) {
          const [mouseX, mouseY] = d3.pointer(event, canvasRef.current);
          const [x, y] = transformRef.current.invert([mouseX, mouseY]);
  
          const interactionRadius = displaySettings.nodeSize / transformRef.current.k;
  
          const node = quadtree.find(x, y, interactionRadius);
          if (node) {
            setRootNode(node);
            setCurrentDepth(1);
            setInMode(true);
            setShowPopup(true);
            simulation.alphaTarget(0);
          }
        }
  
       // Function to enable or disable zooming
       function enableZoom() {
        canvas.call(zoom as any);
      }
  
      function disableZoom() {
        canvas.on('.zoom', null);
      }
  
      // Apply drag behavior only when hovering over nodes
      function handleMouseMove(event: MouseEvent) {
        if (searchedNodeRef) return;
        const [mouseX, mouseY] = d3.pointer(event, canvasRef.current);
        const [x, y] = transformRef.current.invert([mouseX, mouseY]);
  
        const interactionRadius = displaySettings.nodeSize / transformRef.current.k;
        const node = quadtree.find(x, y, interactionRadius);
  
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
  
        if (node) {
          // If hovering over a node
          canvasRef.current!.style.cursor = 'pointer';
          disableZoom(); // Disable panning/zooming
          canvas.call(drag as any); // Enable dragging
  
          hoverTimeoutRef.current = setTimeout(() => {
            if (node !== hoveredNodeRef.current) {
              hoveredNodeRef.current = node;
              render();
            }
          }, hoverDelay);
        } else {
          // Not hovering over a node
          canvasRef.current!.style.cursor = 'grab';
          enableZoom(); // Enable panning/zooming
          canvas.on('.drag', null); // Disable node dragging
  
          if (hoveredNodeRef.current !== null) {
            hoveredNodeRef.current = null;
            render();
          }
        }
      }
  
      function handleMouseLeave() {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        if (hoveredNodeRef.current !== null) {
          hoveredNodeRef.current = null;
          render();
        }
        // Ensure zoom is enabled when the mouse leaves the canvas
        enableZoom();
        canvas.on('.drag', null); // Disable node dragging
      }
        // Clean up
        return () => {
          simulation.stop();
          if (requestId) {
            cancelAnimationFrame(requestId);
          }
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          canvas.on('.zoom', null);
          canvas.on('.drag', null);
          canvas.on('click', null);
          canvas.on('dblclick', null);
          canvas.on('mousemove', null);
          canvas.on('mouseleave', null);
        };
      });
  
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      displayedNodes,
      displayedLinks,
      forces,
      displaySettings,
      width,
      height,
      inMode,
      colorScale,
      isDarkMode,
      enableJitter,
      enableGravityWell,
      enableOrbiting,
      enableRepulsionZones,
      enableElasticLinks,
      enableClustering,
      enableEdgeBundling,
    ]);
  
    // Restart simulation on dependency change
    useEffect(() => {
      if (simulationRef.current) {
        simulationRef.current.alpha(0).restart();
      }
    }, [
      displaySettings.nodeSize,
      displaySettings.linkThickness,
      forces.repelForce,
      forces.linkForce,
      forces.linkDistance,
      forces.centerForce,
      forces.collisionRadius,
      forces.radialRadius,
      isDarkMode,
      enableJitter,
      enableGravityWell,
      enableOrbiting,
      enableRepulsionZones,
      enableElasticLinks,
      enableClustering,
      enableEdgeBundling,
    ]);
  
    // Search functionality
    useEffect(() => {
      const handleSearch = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          const node = nodes.find((n) =>
            n.name.toLowerCase().includes(searchTerm.toLowerCase())
          );
          if (node) {
            onNodeSelect(node);
            setSearchedNodeRef(node);
  
            // Wait for next frame to ensure coordinates are updated
            requestAnimationFrame(() => {
              if (!node.x || !node.y) return;
              const scale = 2;
              const dx = width / 2 - node.x * scale;
              const dy = height / 2 - node.y * scale;
              const canvas = d3.select(canvasRef.current);
              const newTransform = d3.zoomIdentity.translate(dx, dy).scale(scale);
              canvas.transition().duration(750).call(d3.zoom().transform as any, newTransform);
              transformRef.current = newTransform;
              if (simulationRef.current) {
                simulationRef.current.alpha(0.3).restart();
              }
            });
          } else {
            hoveredNodeRef.current = null;
            setSearchedNodeRef(null);
          }
        }
      };
  
      window.addEventListener('keydown', handleSearch);
      return () => {
        window.removeEventListener('keydown', handleSearch);
      };
    }, [searchTerm, nodes, width, height, onNodeSelect, setSearchedNodeRef]);
  
    useEffect(() => {
      if (!searchTerm) {
        hoveredNodeRef.current = null;
        setSearchedNodeRef(null);
        if (simulationRef.current) {
          simulationRef.current.alpha(0.1).restart();
        }
      }
    }, [searchTerm, setSearchedNodeRef]);
  
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (inMode && event.key >= '1' && event.key <= '7') {
          const depth = parseInt(event.key, 10);
          setCurrentDepth(depth);
          setShowPopup(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [inMode]);
  
    const exitMode = () => {
      setInMode(false);
      setRootNode(null);
      setShowPopup(false);
    };
  
    return (
      <div className="flex w-full h-full bg-white text-gray-100 overflow-hidden">
        <div ref={containerRef} className="relative flex-grow">
          <AnimatePresence>
            {inMode && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="absolute top-4 left-4 z-50"
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" size="icon" onClick={exitMode}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Exit Mode</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Exit current mode</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showPopup && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40"
              >
                <Card className="bg-gray-900/80 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <p className="text-lg font-semibold text-blue-300">
                      Press keys 1-7 to set depth
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="block w-full h-full bg-white"
          />
        </div>
      </div>
    );
  };
  
  export default ForceDirectedGraph;
  
  // Helper functions
  
  function applyForces(
    simulation: d3.Simulation<Node, Link>,
    forces: ForcesSettings,
    displayedLinks: Link[],
    enableElasticLinks: boolean,
    enableClustering: boolean,
    enableGravityWell: boolean,
    enableRepulsionZones: boolean,
    enableJitter: boolean,
    width: number,
    height: number
  ) {
    // Clear any existing forces to apply new settings
    simulation.force('link', null);
    simulation.force('charge', null);
    simulation.force('center', null);
    simulation.force('collision', null);
    simulation.force('xCluster', null);
    simulation.force('yCluster', null);
    simulation.force('gravityWell', null);
    simulation.force('jitter', null);
  
    // Force for links
    if (enableElasticLinks) {
      simulation.force(
        'link',
        d3
          .forceLink(displayedLinks)
          .id((d: Node) => d.id)
          .distance((d, i) => 50 + Math.sin(i) * 20) // Adds variability to distance
          .strength(0.1) // Elastic behavior
      );
    } else {
      simulation.force(
        'link',
        d3
          .forceLink(displayedLinks)
          .id((d: Node) => d.id)
          .distance(forces.linkDistance)
          .strength(forces.linkForce)
      );
    }
  
    // Force for clustering
    if (enableClustering) {
      const groupCenters = {
        Person: { x: width / 3, y: height / 2 },
        Company: { x: (2 * width) / 3, y: height / 2 },
        Institution: { x: width / 2, y: height / 3 },
        Ideology: { x: width / 2, y: (2 * height) / 3 },
      };
  
      simulation
        .force(
          'xCluster',
          d3
            .forceX((d: Node) => groupCenters[d.group]?.x || width / 2)
            .strength(0.1)
        )
        .force(
          'yCluster',
          d3
            .forceY((d: Node) => groupCenters[d.group]?.y || height / 2)
            .strength(0.1)
        );
    } else {
      simulation.force(
        'center',
        d3.forceRadial(0, width / 2, height / 2).strength(forces.centerForce)
      );
    }
  
    // Force for repulsion zones (collision handling)
    if (enableRepulsionZones) {
      simulation
        .force(
          'innerCollision',
          d3.forceCollide().radius(forces.collisionRadius).strength(1)
        )
        .force(
          'outerCollision',
          d3
            .forceCollide()
            .radius(forces.collisionRadius * 2)
            .strength(0.5)
        );
    } else {
      simulation.force(
        'collision',
        d3.forceCollide().radius(forces.collisionRadius).strength(0.7)
      );
    }
  
    // Force for node repulsion (charge)
    simulation.force(
      'charge',
      d3.forceManyBody().strength(forces.repelForce)
    );
  
    // Force for gravity well
    if (enableGravityWell) {
      simulation.force(
        'gravityWell',
        d3
          .forceRadial(forces.radialRadius, width / 2, height / 2)
          .strength(0.5)
      );
    }
  
    // Jitter force to add randomness
    if (enableJitter) {
      simulation.force('jitter', (alpha) => {
        simulation.nodes().forEach((node) => {
          node.vx += (Math.random() - 0.5) * alpha * 0.5;
          node.vy += (Math.random() - 0.5) * alpha * 0.5;
        });
      });
    }
  
    // Restart the simulation with the updated forces
    simulation.alpha(1).restart();
  }
  
  
  function drawLinks(
    context: CanvasRenderingContext2D,
    links: Link[],
    nodeMap: Map<string, Node>,
    highlightedLinks: Set<Link>,
    displaySettings: DisplaySettings,
    isDarkMode: boolean,
    highlightedNodes: Set<string>,
    enableEdgeBundling: boolean,
    zoomLevel: number,
    queryType: string
  ) {
    links.forEach((link) => {
      const source = nodeMap.get(typeof link.source === 'string' ? link.source : link.source.id)!;
      const target = nodeMap.get(typeof link.target === 'string' ? link.target : link.target.id)!;
  
      context.beginPath();
  
      if (enableEdgeBundling) {
        const midX = (source.x! + target.x!) / 2;
        const midY = (source.y! + target.y!) / 2;
        const cpX = midX;
        const cpY = midY - 30;
        context.moveTo(source.x!, source.y!);
        context.quadraticCurveTo(cpX, cpY, target.x!, target.y!);
      } else {
        context.moveTo(source.x!, source.y!);
        context.lineTo(target.x!, target.y!);
      }
  
      const isHighlighted = highlightedLinks.has(link);
      context.strokeStyle = isHighlighted ? 'purple' : '#b0b0b0';
      context.lineWidth = isHighlighted
        ? displaySettings.linkThickness * 2
        : displaySettings.linkThickness;
      context.globalAlpha = isHighlighted || !highlightedNodes.size ? 1 : 0.3;
      context.stroke();
  
      // Draw arrowheads if enabled
      if (displaySettings.showArrows) {
        const arrowSize = Math.max(2, displaySettings.linkThickness * 2);
        drawArrowhead(
          context,
          source.x!,
          source.y!,
          target.x!,
          target.y!,
          displaySettings.nodeSize,
          arrowSize
        );
      }
  
      // Draw link labels if enabled
      if (displaySettings.showLinkLabels && source.x && target.x && source.y && target.y) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
  
        context.save();
        context.translate(midX, midY);
        context.rotate(angle);
        context.fillStyle = isDarkMode ? '#fff' : '#000';
        context.font = '4px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.globalAlpha = 0.6;
        context.fillText(link.type, 0, -5);
        context.restore();
      }
    });
  }
  
  function drawArrowhead(
    context: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    nodeRadius: number,
    arrowSize: number
  ) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  
    const arrowX = toX - (toX - fromX) * (nodeRadius / distance);
    const arrowY = toY - (toY - fromY) * (nodeRadius / distance);
  
    context.save();
    context.translate(arrowX, arrowY);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(-arrowSize * 2, -arrowSize);
    context.lineTo(-arrowSize * 2, arrowSize);
    context.closePath();
    context.fillStyle = 'gold';
    context.fill();
    context.restore();
  }
  
  function drawNodes(
    context: CanvasRenderingContext2D,
    nodes: Node[],
    nodeColors: { [key: string]: string },
    images: { [key: string]: HTMLImageElement },
    useSimpleCircles: boolean,
    displaySettings: DisplaySettings,
    isDarkMode: boolean,
    highlightedNodes: Set<string>,
    labelZoomThreshold: number,
    zoomLevel: number
  ) {
    const baseLabelSize = 12; // Increased base label size
  
    nodes.forEach((node) => {
      const isHighlighted = highlightedNodes.has(node.id);
      const radius = displaySettings.nodeSize;
      const baseColor = nodeColors[node.id];
  
      context.globalAlpha = isHighlighted ? 1 : 0.8; // Increase opacity for highlighted nodes
      context.save();
      context.translate(node.x || 0, node.y || 0);
  
      if (useSimpleCircles || !images[node.group]) {
        drawFlatNode(context, node, radius, isHighlighted, baseColor);
      } else {
        context.strokeStyle = isHighlighted ? 'red' : 'white';
        context.lineWidth = isHighlighted ? 2 : 1;
        context.drawImage(images[node.group], -radius, -radius, radius * 2, radius * 2);
        context.stroke();
      }
  
      // Draw labels, scaled with zoom level but capped at 1.2x
      if (zoomLevel > labelZoomThreshold || isHighlighted) {
        context.globalAlpha = 1;
        context.fillStyle = isDarkMode ? '#fff' : '#000';
        context.font = `${Math.min(18, baseLabelSize)}px Arial`; // Increased default label size to 14, max size 18
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.fillText(node.name, 0, radius + 5); // Position labels below nodes
      }
  
      context.restore();
    });
  }
  
  function drawFlatNode(
    context: CanvasRenderingContext2D,
    node: Node,
    radius: number,
    isHighlighted: boolean,
    baseColor: string
  ) {
    const centerX = 0;
    const centerY = 0;
  
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, 2 * Math.PI, true);
    context.fillStyle = baseColor;
    context.fill();
  
    context.strokeStyle = isHighlighted ? '#000000' : '#B0B0B0';
    context.lineWidth = isHighlighted ? 4 : 2;
    context.stroke();
  }
  
  function adjustColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, Math.floor(((num >> 16) * (100 + percent)) / 100));
    const g = Math.min(255, Math.floor((((num >> 8) & 0x00ff) * (100 + percent)) / 100));
    const b = Math.min(255, Math.floor(((num & 0x0000ff) * (100 + percent)) / 100));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }