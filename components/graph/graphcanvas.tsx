'use client';
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

/* ---------- Types ---------------------------------------------------------*/
interface Link {
  id: number;
  source: number | Node;
  target: number | Node;
  type: string;
  [key: string]: any;
}
interface Node {
  id: number;
  label: string;
  [key: string]: any;
}
interface GraphData {
  nodes: Node[];
  links: Link[];
}

/* ---------- GraphCanvas (pure D3) ----------------------------------------*/
export default function GraphCanvas({ graph }: { graph: GraphData }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    if (!graph.nodes || !graph.links || graph.nodes.length === 0) return;

    // Debug info
    console.log("Graph data:", { 
      nodeCount: graph.nodes.length, 
      linkCount: graph.links.length,
      firstNode: graph.nodes[0],
      firstLink: graph.links[0]
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // clear

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const color = d3.scaleOrdinal(d3.schemeSet3);
    
    // Create a node map for quick lookups (optimization)
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
    
    // Make a deep copy and ensure links have proper references
    const links = graph.links.map(link => {
      // Convert source/target to the actual node objects if they're not already
      return {
        ...link,
        source: typeof link.source === 'number' ? link.source : link.source.id,
        target: typeof link.target === 'number' ? link.target : link.target.id
      };
    }).filter(link => 
      // Only keep links where both source and target nodes exist
      nodeMap.has(typeof link.source === 'number' ? link.source : link.source.id) && 
      nodeMap.has(typeof link.target === 'number' ? link.target : link.target.id)
    );

    console.log("Processed links:", links.length);
    
    /* --- simulation setup -------------------------------------------------*/
    const simulation = d3
      .forceSimulation<Node>(graph.nodes)
      .force(
        'link',
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(120)
          .strength(1)
      )
      .force('charge', d3.forceManyBody<Node>().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<Node>().radius(40));

    /* --- links ------------------------------------------------------------*/
    const link = svg
      .append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1.5);

    /* --- nodes ------------------------------------------------------------*/
    const node = svg
      .append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(graph.nodes)
      .join('circle')
      .attr('r', 8)
      .attr('fill', (d) => color(d.label as string) as string)
      .call(
        d3
          .drag<SVGCircleElement, Node>()
          .on('start', dragStarted)
          .on('drag', dragged)
          .on('end', dragEnded)
      );

    node.append('title').text((d) => `${d.label}\n${d.name || ''}`);

    /* --- tick update ------------------------------------------------------*/
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as any).x)
        .attr('y1', (d) => (d.source as any).y)
        .attr('x2', (d) => (d.target as any).x)
        .attr('y2', (d) => (d.target as any).y);

      node.attr('cx', (d) => d.x as any).attr('cy', (d) => d.y as any);
    });

    /* --- drag handlers ----------------------------------------------------*/
    function dragStarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event: any, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragEnded(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    /* --- cleanup ----------------------------------------------------------*/
    return () => simulation.stop();
  }, [graph]);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full rounded-2xl bg-white shadow-inner"
    />
  );
}

/* ---------- Loader (tiny CSS‑only spinner) -------------------------------*/
function Loader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-20 rounded-2xl">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div className="w-8 h-8 border-4 border-dashed border-indigo-600 rounded-full animate-[spin_0.8s_linear_infinite]" />
    </div>
  );
}
