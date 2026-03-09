'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ArchitectureDiff } from '@/lib/api';
import './SideBySideGraph.css';

interface SideBySideGraphProps {
  diff: ArchitectureDiff;
  onNodeClick?: (node: any, side: 'before' | 'after') => void;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
  status?: 'added' | 'removed' | 'modified' | 'unchanged';
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  status?: 'added' | 'removed' | 'unchanged';
}

const NODE_COLORS: Record<string, string> = {
  class: '#3b82f6',
  interface: '#22c55e',
  abstract: '#f97316',
  enum: '#7c3aed',
  typeAlias: '#14b8a6',
  function: '#0ea5e9',
};

const STATUS_COLORS = {
  added: '#22c55e',
  removed: '#ef4444',
  modified: '#f59e0b',
  unchanged: '#64748b',
};

export default function SideBySideGraph({ diff, onNodeClick }: SideBySideGraphProps) {
  const beforeSvgRef = useRef<SVGSVGElement>(null);
  const afterSvgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 500 });

  useEffect(() => {
    const updateDimensions = () => {
      const container = beforeSvgRef.current?.parentElement;
      if (container) {
        setDimensions({
          width: container.clientWidth / 2 - 20,
          height: 500
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!diff || !beforeSvgRef.current || !afterSvgRef.current) return;

    // Prepare before snapshot data
    const beforeNodes = diff.beforeSnapshot.graph.nodes.map((n: any) => {
      const entityChange = diff.entities.removed.find(e => e.id === n.id) ||
                          diff.entities.modified.find(e => e.id === n.id);
      return {
        ...n,
        status: entityChange?.status || 'unchanged'
      };
    });

    const beforeNodeIds = new Set(beforeNodes.map((n: any) => n.id));
    const afterNodeIds = new Set(diff.afterSnapshot.graph.nodes.map((n: any) => n.id));

    // Prepare after snapshot data
    const afterNodes = diff.afterSnapshot.graph.nodes.map((n: any) => {
      const entityChange = diff.entities.added.find(e => e.id === n.id) ||
                          diff.entities.modified.find(e => e.id === n.id);
      return {
        ...n,
        status: entityChange?.status || 'unchanged'
      };
    });

    // Prepare edges with status
    const beforeEdges = diff.beforeSnapshot.graph.edges.map((e: any) => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;

      const wasRemoved = diff.relationships.removed.some(
        r => r.source === sourceId && r.target === targetId && r.type === e.type
      );

      return {
        source: sourceId,
        target: targetId,
        type: e.type,
        status: wasRemoved ? 'removed' : 'unchanged'
      };
    });

    const afterEdges = diff.afterSnapshot.graph.edges.map((e: any) => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;

      const wasAdded = diff.relationships.added.some(
        r => r.source === sourceId && r.target === targetId && r.type === e.type
      );

      return {
        source: sourceId,
        target: targetId,
        type: e.type,
        status: wasAdded ? 'added' : 'unchanged'
      };
    });

    // Render both graphs
    const beforeSim = renderGraph(beforeSvgRef.current, beforeNodes, beforeEdges, dimensions, 'before', onNodeClick);
    const afterSim = renderGraph(afterSvgRef.current, afterNodes, afterEdges, dimensions, 'after', onNodeClick);

    return () => {
      beforeSim?.stop();
      afterSim?.stop();
    };
  }, [diff, dimensions, onNodeClick]);

  return (
    <div className="side-by-side-graph">
      <div className="graph-panel">
        <div className="graph-panel-header">
          <span className="graph-panel-title">
            {diff.from.name} ({diff.from.type})
          </span>
          <span className="graph-panel-hash">{diff.from.hash.substring(0, 7)}</span>
        </div>
        <svg ref={beforeSvgRef} className="graph-svg" />
      </div>

      <div className="graph-panel">
        <div className="graph-panel-header">
          <span className="graph-panel-title">
            {diff.to.name} ({diff.to.type})
          </span>
          <span className="graph-panel-hash">{diff.to.hash.substring(0, 7)}</span>
        </div>
        <svg ref={afterSvgRef} className="graph-svg" />
      </div>

      <div className="graph-legend">
        <div className="graph-legend-item">
          <span className="graph-legend-color added" />
          <span>Added</span>
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-color removed" />
          <span>Removed</span>
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-color modified" />
          <span>Modified</span>
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-color unchanged" />
          <span>Unchanged</span>
        </div>
      </div>
    </div>
  );
}

function renderGraph(
  svgElement: SVGSVGElement,
  nodes: GraphNode[],
  edges: GraphEdge[],
  dimensions: { width: number; height: number },
  side: 'before' | 'after',
  onNodeClick?: (node: any, side: 'before' | 'after') => void
): d3.Simulation<GraphNode, GraphEdge> | null {
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();

  const { width, height } = dimensions;

  svg.attr('viewBox', [0, 0, width, height]);

  const defs = svg.append('defs');

  // Arrow markers
  ['extends', 'implements', 'composition', 'uses', 'imports'].forEach(type => {
    defs.append('marker')
      .attr('id', `arrowhead-${side}-${type}`)
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#64748b');
  });

  // SVG glow filters for status-colored nodes
  const glowColors: Record<string, string> = {
    added: '#22c55e',
    removed: '#ef4444',
    modified: '#f59e0b',
  };

  Object.entries(glowColors).forEach(([status, color]) => {
    const filter = defs.append('filter')
      .attr('id', `glow-${side}-${status}`)
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');

    filter.append('feFlood')
      .attr('flood-color', color)
      .attr('flood-opacity', '0.4')
      .attr('result', 'color');

    filter.append('feComposite')
      .attr('in', 'color')
      .attr('in2', 'blur')
      .attr('operator', 'in')
      .attr('result', 'shadow');

    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'shadow');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');
  });

  const g = svg.append('g');

  // Zoom
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  svg.call(zoom);

  const simulation = d3.forceSimulation<GraphNode>(nodes)
    .force('link', d3.forceLink<GraphNode, GraphEdge>(edges)
      .id(d => d.id)
      .distance(150))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide<GraphNode>().radius(30));

  // Edges
  const link = g.append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('stroke', d => {
      if (d.status === 'removed') return '#ef4444';
      if (d.status === 'added') return '#22c55e';
      return '#64748b';
    })
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', d => d.status === 'removed' ? 0.3 : 0.6)
    .attr('stroke-dasharray', d => d.status === 'removed' ? '4,4' : '')
    .attr('marker-end', d => `url(#arrowhead-${side}-${d.type})`);

  // Animate dashes on removed edges
  link.filter(d => d.status === 'removed')
    .style('animation', 'dashMove 1s linear infinite');

  // Nodes
  const node = g.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      onNodeClick?.(d, side);
    });

  // Node circle with status color + glow filter
  node.append('circle')
    .attr('r', 18)
    .attr('fill', d => {
      if (d.status === 'added') return '#22c55e';
      if (d.status === 'removed') return '#ef4444';
      if (d.status === 'modified') return '#f59e0b';
      return NODE_COLORS[d.type] || '#64748b';
    })
    .attr('stroke', d => {
      if (d.status === 'removed') return '#991b1b';
      if (d.status === 'added') return '#166534';
      if (d.status === 'modified') return '#92400e';
      return NODE_COLORS[d.type] || '#475569';
    })
    .attr('stroke-width', 2)
    .attr('filter', d => {
      if (d.status && d.status !== 'unchanged') {
        return `url(#glow-${side}-${d.status})`;
      }
      return null;
    });

  // Type indicator letter
  node.append('text')
    .text(d => (d.type || 'C').charAt(0).toUpperCase())
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', '#fff')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('font-family', 'var(--font-mono), JetBrains Mono, monospace');

  // Label
  node.append('text')
    .text(d => d.label.length > 15 ? d.label.substring(0, 12) + '...' : d.label)
    .attr('x', 22)
    .attr('y', 4)
    .attr('fill', d => d.status === 'removed' ? '#991b1b' : '#f1f5f9')
    .attr('font-size', '11px')
    .attr('font-family', 'var(--font-mono), JetBrains Mono, monospace');

  simulation.on('tick', () => {
    link
      .attr('x1', d => (d.source as any).x || 0)
      .attr('y1', d => (d.source as any).y || 0)
      .attr('x2', d => (d.target as any).x || 0)
      .attr('y2', d => (d.target as any).y || 0);

    node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
  });

  return simulation;
}
