'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

interface GraphNode {
  id: string;
  label: string;
  type: 'class' | 'interface';
  namespace: string;
  filePath: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'extends' | 'implements' | 'composition';
}

interface GraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
  selectedNodeId?: string;
}

const NODE_COLORS = {
  class: '#3b82f6',
  interface: '#22c55e'
};

const EDGE_COLORS = {
  extends: '#64748b',
  implements: '#94a3b8',
  composition: '#475569'
};

const EDGE_STYLES = {
  extends: 'solid',
  implements: 'dashed',
  composition: 'dotted'
};

export default function Graph({ nodes, edges, onNodeClick, selectedNodeId }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);

  const handleZoom = useCallback((g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    const svgEl = svgRef.current;
    if (svgEl) {
      d3.select(svgEl).call(zoom);
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.attr('viewBox', [0, 0, width, height]);

    const g = svg.append('g');
    handleZoom(g);

    const defs = svg.append('defs');
    
    defs.append('marker')
      .attr('id', 'arrowhead-extends')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', EDGE_COLORS.extends);

    defs.append('marker')
      .attr('id', 'arrowhead-implements')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', EDGE_COLORS.implements);

    const nodesCopy: GraphNode[] = nodes.map(n => ({ ...n }));
    const edgesCopy: GraphEdge[] = edges.map(e => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : e.source.id,
      target: typeof e.target === 'string' ? e.target : e.target.id
    }));

    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edgesCopy)
        .id(d => d.id)
        .distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    simulationRef.current = simulation;

    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edgesCopy)
      .join('line')
      .attr('stroke', d => EDGE_COLORS[d.type])
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', d => EDGE_STYLES[d.type] === 'dashed' ? '5,5' : EDGE_STYLES[d.type] === 'dotted' ? '2,2' : '')
      .attr('marker-end', d => `url(#arrowhead-${d.type})`);

    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodesCopy)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<any, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    node.append('circle')
      .attr('r', 16)
      .attr('fill', d => NODE_COLORS[d.type])
      .attr('stroke', d => selectedNodeId === d.id ? '#fff' : 'transparent')
      .attr('stroke-width', 3);

    node.append('text')
      .text(d => d.label)
      .attr('x', 22)
      .attr('y', 5)
      .attr('fill', '#f1f5f9')
      .attr('font-size', '12px')
      .attr('font-weight', '500');

    node.append('text')
      .text(d => d.type === 'class' ? 'C' : 'I')
      .attr('x', 0)
      .attr('y', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold');

    node.on('click', (event, d) => {
      event.stopPropagation();
      onNodeClick(d);
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x || 0)
        .attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0)
        .attr('y2', d => (d.target as GraphNode).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, selectedNodeId, onNodeClick, handleZoom]);

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', background: '#0f172a' }}
    />
  );
}
