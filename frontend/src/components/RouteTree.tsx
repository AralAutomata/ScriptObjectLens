'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { RouteNode, HttpMethod } from '@/lib/api';

interface RouteTreeProps {
  routes: RouteNode[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e',
  POST: '#3b82f6',
  PUT: '#f97316',
  DELETE: '#ef4444',
  PATCH: '#a855f7',
  HEAD: '#64748b',
  OPTIONS: '#14b8a6',
  ALL: '#94a3b8',
};

function getMethodColor(method: string): string {
  // Handle single method
  if (METHOD_COLORS[method]) return METHOD_COLORS[method];
  // Handle multiple methods - use first one or default
  const firstMethod = method.split(',')[0].trim();
  return METHOD_COLORS[firstMethod] || METHOD_COLORS.ALL;
}

function formatMethod(method: string): string {
  // If multiple methods, show first + count
  if (method.includes(',')) {
    const methods = method.split(',').map(m => m.trim());
    return methods.length > 2 ? `${methods[0]} +${methods.length - 1}` : method;
  }
  return method;
}

const BG_COLOR = '#0f172a';
const TEXT_COLOR = '#f1f5f9';
const TEXT_MUTED = '#94a3b8';

interface TreeNode extends d3.HierarchyNode<RouteNode> {
  x?: number;
  y?: number;
}

function normalizeRouteNode(node: RouteNode): RouteNode {
  return {
    ...node,
    children: (node.children ?? []).map(normalizeRouteNode),
    path: node.path ?? '',
    segment: node.segment ?? '',
    fullPath: node.fullPath ?? node.path ?? '',
    method: node.method || 'ALL',
    type: node.type || 'layout',
    filePath: node.filePath || '',
  };
}

function normalizeRouteNodes(nodes: RouteNode[]): RouteNode[] {
  return nodes.map(normalizeRouteNode);
}

function hasRoutePayload(nodes: RouteNode[]): boolean {
  return nodes.length > 0;
}

export default function RouteTree({ routes }: RouteTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<RouteNode | null>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        setDimensions({
          width: svgRef.current.clientWidth,
          height: svgRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    const handleResize = () => updateDimensions();
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;

    if (svgRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateDimensions());
      resizeObserver.observe(svgRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);

      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  // Initialize expanded state with all nodes expanded
  useEffect(() => {
    if (routes.length === 0) {
      setExpandedNodes(new Set());
      return;
    }

    const safeRoutes = normalizeRouteNodes(routes);
    const allIds = new Set<string>();

    const collectIds = (nodes: RouteNode[]) => {
      nodes.forEach((node) => {
        allIds.add(node.id);
        collectIds(node.children);
      });
    };

    collectIds(safeRoutes);
    setExpandedNodes(allIds);
  }, [routes]);

  useEffect(() => {
    if (!svgRef.current) return;
    if (dimensions.width < 24 || dimensions.height < 24) return;
    if (!hasRoutePayload(routes) || expandedNodes.size === 0) return;

    const safeRoutes = normalizeRouteNodes(routes);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;
    svg.attr('viewBox', [0, 0, width, height]);

    const defs = svg.append('defs');

    // Arrow marker
    defs
      .append('marker')
      .attr('id', 'tree-arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#475569');

    const g = svg.append('g');

    // Zoom handler
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Create hierarchical data
    const rootNode: RouteNode = {
      id: 'root',
      path: '/',
      segment: '/',
      fullPath: '/',
      method: 'ALL',
      type: 'layout',
      filePath: '',
      children: safeRoutes,
    };

    const root: d3.HierarchyNode<RouteNode> = d3.hierarchy(
      rootNode,
      (d) => (d.id === 'root' || expandedNodes.has(d.id) ? d.children : [])
    );

    // Tree layout
    const treeLayout = d3.tree<RouteNode>().nodeSize([50, 150]);
    treeLayout(root);

    // Draw links
    const links = g
      .selectAll('.link')
      .data(root.links())
      .join('path')
      .attr('class', 'link')
      .attr('d', (d) => {
        const source = d.source as TreeNode;
        const target = d.target as TreeNode;
        const sx = source.x ?? 0;
        const sy = source.y ?? 0;
        const tx = target.x ?? 0;
        const ty = target.y ?? 0;
        return `M${sy},${sx} C${(sy + ty) / 2},${sx} ${(sy + ty) / 2},${tx} ${ty},${tx}`;
      })
      .attr('fill', 'none')
      .attr('stroke', '#475569')
      .attr('stroke-width', 1.5);

    // Draw nodes
    const nodes = g
      .selectAll('.node')
      .data(root.descendants().filter((d) => d.data.id !== 'root'))
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        toggleNode(d.data.id);
      })
      .on('mouseenter', (event, d) => setHoveredNode(d.data))
      .on('mouseleave', () => setHoveredNode(null));

    // Node shape (square for API, circle for page)
    nodes
      .append('rect')
      .attr('width', 24)
      .attr('height', 24)
      .attr('x', -12)
      .attr('y', -12)
      .attr('rx', (d) => (d.data.type === 'api' ? 4 : 12))
      .attr('fill', (d) => getMethodColor(d.data.method))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Expand/collapse indicator
    nodes
      .filter((d) => d.data.children && d.data.children.length > 0)
      .append('circle')
      .attr('r', 6)
      .attr('cx', 0)
      .attr('cy', 14)
      .attr('fill', '#334155')
      .attr('stroke', '#475569');

    nodes
      .filter((d) => d.data.children && d.data.children.length > 0)
      .append('text')
      .attr('x', 0)
      .attr('y', 17)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', TEXT_COLOR)
      .text((d) => (expandedNodes.has(d.data.id) ? '-' : '+'));

    // Labels
    nodes
      .append('text')
      .attr('x', 20)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('fill', TEXT_COLOR)
      .attr('font-family', 'system-ui, sans-serif')
      .text((d) => d.data.segment);

    // Method label
    nodes
      .append('text')
      .attr('x', 20)
      .attr('y', 18)
      .attr('font-size', '9px')
      .attr('fill', TEXT_MUTED)
      .attr('font-family', 'system-ui, sans-serif')
      .text((d) => formatMethod(d.data.method));

    const bounds = g.node()?.getBBox();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const fullWidth = bounds.width;
      const fullHeight = bounds.height;
      const midX = bounds.x + fullWidth / 2;
      const midY = bounds.y + fullHeight / 2;
      const fitScale = Math.min(0.8, Math.min(width / fullWidth, height / fullHeight));
      const scale = Math.min(fitScale, 1);
      const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

      svg.call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }
  }, [routes, expandedNodes, dimensions]);

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (routes.length === 0) {
    return (
      <div className="no-results" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '14px', gap: '8px' }}>
        <p>No routes found. This project may not use Next.js, Express, or Hono.</p>
      </div>
    );
  }

  // Count routes by method
  const methodCounts: Record<string, number> = {};
  const countRoutes = (nodes: RouteNode[]) => {
    nodes.forEach((node) => {
      methodCounts[node.method] = (methodCounts[node.method] || 0) + 1;
      if (node.children) countRoutes(node.children);
    });
  };
  countRoutes(routes);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', background: BG_COLOR }} />
      {hoveredNode && <HoverCard node={hoveredNode} />}
      <Legend methodCounts={methodCounts} />
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '12px',
          color: TEXT_COLOR,
        }}
      >
        {Object.values(methodCounts).reduce((a, b) => a + b, 0)} routes
      </div>
    </div>
  );
}

function HoverCard({ node }: { node: RouteNode }) {
  return (
    <div
      style={{
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
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: node.type === 'api' ? '4px' : '50%',
            background: getMethodColor(node.method),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          {formatMethod(node.method)}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: TEXT_COLOR }}>{node.segment}</div>
          <div style={{ fontSize: '11px', color: TEXT_MUTED }}>{node.type}</div>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: TEXT_MUTED, marginBottom: '4px' }}>
        <span style={{ color: TEXT_COLOR }}>Path:</span> {node.fullPath}
      </div>
      <div style={{ fontSize: '12px', color: TEXT_MUTED, marginBottom: '4px' }}>
        <span style={{ color: TEXT_COLOR }}>Method:</span> {node.method}
      </div>
      {node.filePath && (
        <div style={{ fontSize: '11px', color: TEXT_MUTED, wordBreak: 'break-all' }}>{node.filePath}</div>
      )}
    </div>
  );
}

function Legend({ methodCounts }: { methodCounts: Record<string, number> }) {
  const methods = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '14px 18px',
        fontSize: '12px',
        color: TEXT_COLOR,
        backdropFilter: 'blur(8px)',
        maxWidth: '200px',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: '10px',
          color: TEXT_MUTED,
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        HTTP Methods
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {methods.map(([method, count]) => (
          <div key={method} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px',
                  background: METHOD_COLORS[method as HttpMethod] || METHOD_COLORS.ALL,
                }}
              />
              <span style={{ fontSize: '11px' }}>{method}</span>
            </div>
            <span style={{ fontSize: '10px', color: TEXT_MUTED }}>{count}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: '1px solid #334155',
          fontSize: '10px',
          color: TEXT_MUTED,
        }}
      >
        Click nodes to expand/collapse • Scroll to zoom • Drag to pan
      </div>
    </div>
  );
}
