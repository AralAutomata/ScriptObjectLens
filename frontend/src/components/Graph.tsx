'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
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

const EDGE_COLORS: Record<string, string> = {
  extends: '#64748b',
  implements: '#94a3b8',
  composition: '#475569',
};

const NODE_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  class: { fill: '#3b82f6', stroke: '#2563eb', glow: 'rgba(59, 130, 246, 0.4)' },
  interface: { fill: '#22c55e', stroke: '#16a34a', glow: 'rgba(34, 197, 94, 0.4)' },
};

const BG_COLOR = '#0f172a';
const TEXT_COLOR = '#f1f5f9';
const TEXT_MUTED = '#94a3b8';

export default function Graph({ nodes, edges, onNodeClick, selectedNodeId }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        setDimensions({
          width: svgRef.current.clientWidth,
          height: svgRef.current.clientHeight
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleZoom = useCallback((g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
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

    const { width, height } = dimensions;

    svg.attr('viewBox', [0, 0, width, height]);

    // Add glow filter
    const defs = svg.append('defs');
    
    // Glow filter for nodes
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Gradient for edges
    const gradient = defs.append('linearGradient')
      .attr('id', 'edge-gradient')
      .attr('gradientUnits', 'userSpaceOnUse');
    
    gradient.append('stop').attr('offset', '0%').attr('stop-color', EDGE_COLORS.extends).attr('stop-opacity', 0.6);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', EDGE_COLORS.extends).attr('stop-opacity', 0.2);

    // Arrow markers
    ['extends', 'implements', 'composition'].forEach(type => {
      defs.append('marker')
        .attr('id', `arrowhead-${type}`)
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', EDGE_COLORS[type]);
    });

    const g = svg.append('g');
    handleZoom(g);

    const nodesCopy: GraphNode[] = nodes.map(n => ({ ...n }));
    const edgesCopy: GraphEdge[] = edges.map(e => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : e.source.id,
      target: typeof e.target === 'string' ? e.target : e.target.id
    }));

    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edgesCopy)
        .id(d => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(60))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    simulationRef.current = simulation;

    // Edges
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edgesCopy)
      .join('line')
      .attr('stroke', d => EDGE_COLORS[d.type])
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', d => {
        if (d.type === 'implements') return '8,4';
        if (d.type === 'composition') return '3,3';
        return '';
      })
      .attr('marker-end', d => `url(#arrowhead-${d.type})`);

    // Node groups
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

    // Outer glow circle
    node.append('circle')
      .attr('r', 22)
      .attr('fill', d => NODE_COLORS[d.type].glow)
      .attr('opacity', 0)
      .attr('class', 'glow-circle');

    // Main circle
    node.append('circle')
      .attr('r', 16)
      .attr('fill', d => NODE_COLORS[d.type].fill)
      .attr('stroke', d => NODE_COLORS[d.type].stroke)
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)');

    // Type indicator (C or I)
    node.append('text')
      .text(d => d.type === 'class' ? 'C' : 'I')
      .attr('x', 0)
      .attr('y', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'system-ui, sans-serif');

    // Node label
    node.append('text')
      .text(d => d.label.length > 18 ? d.label.substring(0, 16) + '...' : d.label)
      .attr('x', 24)
      .attr('y', 4)
      .attr('fill', TEXT_COLOR)
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .attr('font-family', 'system-ui, sans-serif');

    // Hover effects
    node.on('mouseenter', function(event, d) {
      d3.select(this).select('.glow-circle')
        .transition()
        .duration(200)
        .attr('opacity', 1);
      
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', 18);
    })
    .on('mouseleave', function(event, d) {
      d3.select(this).select('.glow-circle')
        .transition()
        .duration(200)
        .attr('opacity', 0);
      
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', 16);
    });

    node.on('click', (event, d) => {
      event.stopPropagation();
      onNodeClick(d);
    });

    // Click on background to deselect
    svg.on('click', () => {
      onNodeClick(nodes[0] as any);
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x || 0)
        .attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0)
        .attr('y2', d => (d.target as GraphNode).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Initial centering
    setTimeout(() => {
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const fullWidth = bounds.width;
        const fullHeight = bounds.height;
        const midX = bounds.x + fullWidth / 2;
        const midY = bounds.y + fullHeight / 2;
        
        const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
        const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
        
        svg.transition()
          .duration(500)
          .call(
            d3.zoom<SVGSVGElement, unknown>().transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
          );
      }
    }, 1000);

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
  }, [nodes, edges, selectedNodeId, onNodeClick, handleZoom, dimensions]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', background: BG_COLOR }}
      />
      <GraphLegend />
    </div>
  );
}

function GraphLegend() {
  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '12px',
      color: TEXT_COLOR,
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{ fontWeight: 600, marginBottom: '8px', color: TEXT_MUTED, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legend</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: NODE_COLORS.class.fill }} />
          <span>Class</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: NODE_COLORS.interface.fill }} />
          <span>Interface</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <div style={{ width: '20px', height: '2px', background: EDGE_COLORS.extends }} />
          <span style={{ color: TEXT_MUTED }}>extends</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '2px', borderTop: `2px dashed ${EDGE_COLORS.implements}` }} />
          <span style={{ color: TEXT_MUTED }}>implements</span>
        </div>
      </div>
      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '10px', color: TEXT_MUTED }}>
        Scroll to zoom • Drag to pan
      </div>
    </div>
  );
}
