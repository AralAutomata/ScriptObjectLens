'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface ClassMethod {
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
}

interface ClassProperty {
  name: string;
  type: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'class' | 'interface' | 'abstract';
  namespace: string;
  filePath: string;
  extends?: string;
  implements: string[];
  methods: ClassMethod[];
  properties: ClassProperty[];
  methodCount: number;
  propertyCount: number;
  inheritanceDepth: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'extends' | 'implements' | 'composition' | 'uses';
  label?: string;
}

interface GraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
  selectedNodeId?: string;
}

const NODE_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  class: { fill: '#3b82f6', stroke: '#2563eb', glow: 'rgba(59, 130, 246, 0.4)' },
  interface: { fill: '#22c55e', stroke: '#16a34a', glow: 'rgba(34, 197, 94, 0.4)' },
  abstract: { fill: '#f97316', stroke: '#ea580c', glow: 'rgba(249, 115, 22, 0.4)' },
};

const EDGE_COLORS: Record<string, string> = {
  extends: '#64748b',
  implements: '#94a3b8',
  composition: '#475569',
  uses: '#64748b',
};

const BG_COLOR = '#0f172a';
const TEXT_COLOR = '#f1f5f9';
const TEXT_MUTED = '#94a3b8';

export default function Graph({ nodes, edges, onNodeClick, selectedNodeId }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

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
    const handleResize = () => updateDimensions();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calculateNodeSize = (node: GraphNode): number => {
    const complexity = node.methodCount + node.propertyCount;
    return Math.max(20, Math.min(40, 20 + complexity * 1.5));
  };

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;

    svg.attr('viewBox', [0, 0, width, height]);

    const defs = svg.append('defs');
    
    // Glow filter
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

    // Arrow markers
    ['extends', 'implements', 'composition', 'uses'].forEach(type => {
      defs.append('marker')
        .attr('id', `arrowhead-${type}`)
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', EDGE_COLORS[type]);
    });

    const g = svg.append('g');

    // Zoom handler
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    const nodesCopy: GraphNode[] = nodes.map(n => ({ ...n }));
    const edgesCopy: GraphEdge[] = edges.map(e => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : e.source.id,
      target: typeof e.target === 'string' ? e.target : e.target.id
    }));

    // Build adjacency map for quick lookup
    const adjacencyMap = new Map<string, Set<string>>();
    edgesCopy.forEach(edge => {
      const sourceId = edge.source as string;
      const targetId = edge.target as string;
      
      if (!adjacencyMap.has(sourceId)) adjacencyMap.set(sourceId, new Set());
      if (!adjacencyMap.has(targetId)) adjacencyMap.set(targetId, new Set());
      
      adjacencyMap.get(sourceId)!.add(targetId);
      adjacencyMap.get(targetId)!.add(sourceId);
    });

    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edgesCopy)
        .id(d => d.id)
        .distance(180))
      .force('charge', d3.forceManyBody().strength(-600))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => calculateNodeSize(d) + 20))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03));

    simulationRef.current = simulation;

    // Edge group
    const linkGroup = g.append('g').attr('class', 'links');
    
    const link = linkGroup
      .selectAll('g')
      .data(edgesCopy)
      .join('g')
      .attr('class', 'edge-group');

    link.append('line')
      .attr('stroke', d => EDGE_COLORS[d.type])
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', d => {
        if (d.type === 'implements') return '8,4';
        if (d.type === 'composition') return '4,4';
        if (d.type === 'uses') return '2,4';
        return '';
      })
      .attr('marker-end', d => `url(#arrowhead-${d.type})`);

    // Node group
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

    // Glow circle
    node.append('circle')
      .attr('class', 'glow')
      .attr('r', d => calculateNodeSize(d) + 8)
      .attr('fill', d => NODE_COLORS[d.type].glow)
      .attr('opacity', 0);

    // Main circle
    node.append('circle')
      .attr('r', d => calculateNodeSize(d))
      .attr('fill', d => NODE_COLORS[d.type].fill)
      .attr('stroke', d => NODE_COLORS[d.type].stroke)
      .attr('stroke-width', d => d.type === 'abstract' ? 3 : 2)
      .attr('stroke-dasharray', d => d.type === 'abstract' ? '4,2' : '')
      .attr('filter', 'url(#glow)');

    // Type indicator
    node.append('text')
      .text(d => d.type === 'class' ? 'C' : d.type === 'abstract' ? 'A' : 'I')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#fff')
      .attr('font-size', d => Math.max(10, calculateNodeSize(d) * 0.5))
      .attr('font-weight', 'bold')
      .attr('font-family', 'system-ui, sans-serif');

    // Method badge
    node.filter(d => d.methodCount > 0)
      .append('text')
      .text(d => `M${d.methodCount}`)
      .attr('x', d => calculateNodeSize(d) + 4)
      .attr('y', -4)
      .attr('fill', '#60a5fa')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'system-ui, sans-serif');

    // Property badge
    node.filter(d => d.propertyCount > 0)
      .append('text')
      .text(d => `P${d.propertyCount}`)
      .attr('x', d => calculateNodeSize(d) + 4)
      .attr('y', 8)
      .attr('fill', '#22c55e')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'system-ui, sans-serif');

    // Depth badge
    node.filter(d => d.inheritanceDepth > 0)
      .append('text')
      .text(d => `D${d.inheritanceDepth}`)
      .attr('x', d => -calculateNodeSize(d) - 4)
      .attr('y', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#f97316')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'system-ui, sans-serif');

    // Node label
    node.append('text')
      .text(d => d.label.length > 20 ? d.label.substring(0, 18) + '...' : d.label)
      .attr('x', d => calculateNodeSize(d) + 12)
      .attr('y', 4)
      .attr('fill', TEXT_COLOR)
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .attr('font-family', 'system-ui, sans-serif');

    // Namespace label
    node.append('text')
      .text(d => d.namespace ? (d.namespace.split('.').pop() || '') : '')
      .attr('x', d => calculateNodeSize(d) + 12)
      .attr('y', 18)
      .attr('fill', TEXT_MUTED)
      .attr('font-size', '10px')
      .attr('font-family', 'system-ui, sans-serif');

    // Hover handlers with direct D3 manipulation (no React state)
    node.on('mouseenter', function(event, d) {
      d3.select(this).select('.glow')
        .transition()
        .duration(150)
        .attr('opacity', 1);
      
      d3.select(this).raise();
      
      // Direct D3 highlighting - no React state
      const connectedIds = adjacencyMap.get(d.id) || new Set();
      
      node.style('opacity', n => {
        if (connectedIds.has(n.id) || n.id === d.id) return 1;
        return 0.25;
      });
      
      link.style('opacity', l => {
        const sourceId = l.source as string;
        const targetId = l.target as string;
        if (sourceId === d.id || targetId === d.id) return 0.9;
        return 0.08;
      });
      
      setHoveredNode(d);
    })
    .on('mouseleave', function(event, d) {
      d3.select(this).select('.glow')
        .transition()
        .duration(150)
        .attr('opacity', 0);
      
      // Reset opacity
      node.style('opacity', 1);
      link.style('opacity', 0.6);
      
      setHoveredNode(null);
    });

    node.on('click', (event, d) => {
      event.stopPropagation();
      onNodeClick(d);
    });

    svg.on('click', () => {
      node.style('opacity', 1);
      link.style('opacity', 0.6);
    });

    // Add selection ring (red indicator)
    const selectionRing = node.append('circle')
      .attr('class', 'selection-ring')
      .attr('r', d => calculateNodeSize(d) + 6)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 3)
      .attr('opacity', 0)
      .style('pointer-events', 'none');

    // Update selection ring when selectedNodeId changes
    if (selectedNodeId) {
      selectionRing
        .attr('opacity', d => d.id === selectedNodeId ? 1 : 0)
        .attr('r', d => d.id === selectedNodeId ? calculateNodeSize(d) + 6 : 0);
    }

    simulation.on('tick', () => {
      link.select('line')
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
        const fullWidth = bounds.width || width;
        const fullHeight = bounds.height || height;
        const midX = bounds.x + fullWidth / 2;
        const midY = bounds.y + fullHeight / 2;
        
        const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
        const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
        
        svg.transition()
          .duration(500)
          .call(
            d3.zoom<SVGSVGElement, unknown>().transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(Math.min(scale, 1))
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
  }, [nodes, edges, selectedNodeId, onNodeClick, dimensions]);

  // Update selection ring when selectedNodeId changes
  useEffect(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('.selection-ring')
      .attr('opacity', (d: any) => d.id === selectedNodeId ? 1 : 0)
      .attr('r', (d: any) => {
        const size = Math.max(20, Math.min(40, 20 + (d.methodCount + d.propertyCount) * 1.5));
        return d.id === selectedNodeId ? size + 6 : 0;
      });
  }, [selectedNodeId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', background: BG_COLOR }}
      />
      {hoveredNode && (
        <HoverCard node={hoveredNode} />
      )}
      <GraphLegend />
    </div>
  );
}

function HoverCard({ node }: { node: GraphNode }) {
  const previewMethods = node.methods.slice(0, 5);
  const moreCount = node.methods.length - 5;
  
  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      background: 'rgba(30, 41, 59, 0.95)',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '16px',
      maxWidth: '320px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      zIndex: 100,
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: NODE_COLORS[node.type].fill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '14px',
        }}>
          {node.type === 'class' ? 'C' : node.type === 'abstract' ? 'A' : 'I'}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '16px', color: TEXT_COLOR }}>{node.label}</div>
          <div style={{ fontSize: '12px', color: TEXT_MUTED }}>{node.namespace || 'Global'}</div>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ 
          padding: '4px 10px', 
          background: 'rgba(59, 130, 246, 0.2)', 
          borderRadius: '12px',
          fontSize: '11px',
          color: '#60a5fa'
        }}>
          M: {node.methodCount}
        </div>
        <div style={{ 
          padding: '4px 10px', 
          background: 'rgba(34, 197, 94, 0.2)', 
          borderRadius: '12px',
          fontSize: '11px',
          color: '#22c55e'
        }}>
          P: {node.propertyCount}
        </div>
        {node.inheritanceDepth > 0 && (
          <div style={{ 
            padding: '4px 10px', 
            background: 'rgba(249, 115, 22, 0.2)', 
            borderRadius: '12px',
            fontSize: '11px',
            color: '#f97316'
          }}>
            Depth: {node.inheritanceDepth}
          </div>
        )}
      </div>
      
      {node.extends && (
        <div style={{ fontSize: '12px', color: TEXT_MUTED, marginBottom: '8px' }}>
          <span style={{ color: TEXT_COLOR }}>extends</span> {node.extends}
        </div>
      )}
      
      {node.implements.length > 0 && (
        <div style={{ fontSize: '12px', color: TEXT_MUTED, marginBottom: '8px' }}>
          <span style={{ color: TEXT_COLOR }}>implements</span> {node.implements.join(', ')}
        </div>
      )}
      
      {previewMethods.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: TEXT_MUTED, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Methods
          </div>
          {previewMethods.map((m, i) => (
            <div key={i} style={{ 
              fontSize: '11px', 
              fontFamily: 'monospace',
              color: '#dcdcaa',
              padding: '3px 0',
              borderBottom: '1px solid #1e293b'
            }}>
              {m.name}({m.parameters.map(p => p.name).join(', ')}): {m.returnType}
            </div>
          ))}
          {moreCount > 0 && (
            <div style={{ fontSize: '11px', color: TEXT_MUTED, paddingTop: '4px' }}>
              +{moreCount} more methods
            </div>
          )}
        </div>
      )}
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
      borderRadius: '12px',
      padding: '14px 18px',
      fontSize: '12px',
      color: TEXT_COLOR,
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{ fontWeight: 600, marginBottom: '10px', color: TEXT_MUTED, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legend</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: NODE_COLORS.class.fill }} />
          <span style={{ fontSize: '12px' }}>Class</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: NODE_COLORS.abstract.fill, border: '2px dashed #ea580c' }} />
          <span style={{ fontSize: '12px' }}>Abstract</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: NODE_COLORS.interface.fill }} />
          <span style={{ fontSize: '12px' }}>Interface</span>
        </div>
        <div style={{ borderTop: '1px solid #334155', paddingTop: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', color: TEXT_MUTED, marginBottom: '6px' }}>Badges</div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
            <span style={{ color: '#60a5fa' }}>M#</span> Methods
            <span style={{ color: '#22c55e' }}>P#</span> Properties
            <span style={{ color: '#f97316' }}>D#</span> Depth
          </div>
        </div>
      </div>
      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #334155', fontSize: '10px', color: TEXT_MUTED }}>
        Scroll to zoom • Drag to pan • Hover to highlight
      </div>
    </div>
  );
}
