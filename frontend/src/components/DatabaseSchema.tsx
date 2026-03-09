'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { SchemaModel, SchemaField, SchemaRelation } from '@/lib/api';

interface DatabaseSchemaProps {
  models: SchemaModel[];
  relations: SchemaRelation[];
}

const BG_COLOR = '#0f172a';
const TEXT_COLOR = '#f1f5f9';
const TEXT_MUTED = '#94a3b8';
const CARD_BG = '#1e293b';
const CARD_BORDER = '#334155';
const RELATION_COLOR = '#a855f7';
const ID_COLOR = '#fbbf24';
const LINK_DISTANCE = 320;
const CHARGE_STRENGTH = -900;
const COLLISION_PADDING = 56;

const RELATION_TYPE_COLORS: Record<SchemaRelation['type'], string> = {
  'one-to-one': '#22c55e',
  'one-to-many': '#3b82f6',
  'many-to-many': '#a855f7',
  'many-to-one': '#f59e0b',
}

interface SchemaNode extends SchemaModel {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function getCardBorderPoint(from: SchemaNode, to: SchemaNode): Point {
  const sx = from.x ?? 0;
  const sy = from.y ?? 0;
  const tx = to.x ?? 0;
  const ty = to.y ?? 0;
  const dx = tx - sx;
  const dy = ty - sy;

  if (dx === 0 && dy === 0) {
    return { x: sx, y: sy };
  }

  const halfWidth = from.width / 2;
  const halfHeight = from.height / 2;

  const xScale = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfWidth / dx);
  const yScale = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfHeight / dy);
  const scale = Math.min(1, Math.min(xScale, yScale));

  return {
    x: sx + dx * scale,
    y: sy + dy * scale,
  };
}

export default function DatabaseSchema({ models, relations }: DatabaseSchemaProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredModel, setHoveredModel] = useState<SchemaModel | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

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

  // Separate effect for selection highlighting only
  useEffect(() => {
    if (!svgRef.current || models.length === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('.model-card rect')
      .attr('stroke', (d: unknown) => {
        const node = d as SchemaNode;
        return selectedModel === node.id ? RELATION_COLOR : CARD_BORDER;
      })
      .attr('stroke-width', (d: unknown) => {
        const node = d as SchemaNode;
        return selectedModel === node.id ? 3 : 1;
      });
  }, [selectedModel, models]);

  // Calculate card dimensions based on content
  const calculateCardDimensions = (model: SchemaModel): { width: number; height: number } => {
    const width = 200;
    const headerHeight = 40;
    const fieldHeight = 24;
    const height = headerHeight + model.fields.length * fieldHeight + 16;
    return { width, height };
  };

  useEffect(() => {
    if (!svgRef.current) return;
    if (models.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;
    svg.attr('viewBox', [0, 0, width, height]);

    const defs = svg.append('defs');

    // Arrow markers for relation types
    (Object.keys(RELATION_TYPE_COLORS) as SchemaRelation['type'][]).forEach((type) => {
      defs
        .append('marker')
        .attr('id', `relation-arrowhead-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('markerUnits', 'strokeWidth')
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5 Z')
        .attr('fill', RELATION_TYPE_COLORS[type]);
    });

    const g = svg.append('g');

    // Zoom handler
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Prepare nodes with dimensions
    const spreadRadius = Math.max(180, Math.min(width, height) * 0.34);

    const nodes: SchemaNode[] = models.map((model, index) => {
      const angle = (index / Math.max(models.length, 1)) * Math.PI * 2;

      return {
        ...model,
        ...calculateCardDimensions(model),
        x: width / 2 + Math.cos(angle) * spreadRadius,
        y: height / 2 + Math.sin(angle) * spreadRadius,
      };
    });

    // Force simulation
    const simulation = d3
      .forceSimulation<SchemaNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SchemaNode, { source: string; target: string }>(
            relations.map((r) => ({ source: r.source, target: r.target }))
          )
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
          .strength(0.42)
      )
      .force('charge', d3.forceManyBody().strength(CHARGE_STRENGTH).distanceMax(960))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SchemaNode>().radius((d) => Math.max(d.width, d.height) / 2 + COLLISION_PADDING))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .alphaDecay(0.032)
      .velocityDecay(0.45);

    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    const pairTotals = new Map<string, number>();
    relations.forEach((relation) => {
      const pairKey = [relation.source, relation.target].sort().join('|');
      pairTotals.set(pairKey, (pairTotals.get(pairKey) || 0) + 1);
    });

    const pairSeen = new Map<string, number>();
    const relationCurveOffsets = new Map<SchemaRelation, number>();
    relations.forEach((relation) => {
      const pairKey = [relation.source, relation.target].sort().join('|');
      const seen = pairSeen.get(pairKey) || 0;
      pairSeen.set(pairKey, seen + 1);
      const total = pairTotals.get(pairKey) || 1;
      const centeredIndex = seen - (total - 1) / 2;
      relationCurveOffsets.set(relation, centeredIndex * 26);
    });

    // Draw relations FIRST (so nodes render on top of edges)
    const linkGroup = g.append('g').attr('class', 'links');

    const relationGroups = linkGroup
      .selectAll('g.relation-link')
      .data(relations)
      .join('g')
      .attr('class', 'relation-link')
      .style('pointer-events', 'none');

    const linkBackdrops = relationGroups
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(15, 23, 42, 0.92)')
      .attr('stroke-width', 6)
      .style('opacity', 0.95);

    const links = relationGroups
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => RELATION_TYPE_COLORS[d.type] || RELATION_COLOR)
      .attr('stroke-width', 2.2)
      .attr('stroke-dasharray', (d) => (d.type === 'many-to-many' ? '6,4' : ''))
      .attr('marker-end', (d) => `url(#relation-arrowhead-${d.type})`)
      .style('opacity', 0.95);

    const sourceDots = relationGroups
      .append('circle')
      .attr('r', 3.5)
      .attr('fill', (d) => RELATION_TYPE_COLORS[d.type] || RELATION_COLOR)
      .style('opacity', 0.95);

    const cardGroup = g.append('g').attr('class', 'cards');

    const cards = cardGroup
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'model-card')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedModel(prev => prev === d.id ? null : d.id);
      })
      .on('mouseenter', (event, d) => {
        setHoveredModel(d);

        // Highlight connected
        const connectedIds = new Set<string>();
        relations.forEach((rel) => {
          if (rel.source === d.id) connectedIds.add(rel.target);
          if (rel.target === d.id) connectedIds.add(rel.source);
        });

        cardGroup.selectAll('g').style('opacity', (n: unknown) => {
          const node = n as SchemaNode;
          if (node.id === d.id || connectedIds.has(node.id)) return 1;
          return 0.4;
        });

        linkGroup.selectAll('g.relation-link').style('opacity', (rel: unknown) => {
          const relation = rel as SchemaRelation;
          if (relation.source === d.id || relation.target === d.id) return 1;
          return 0.2;
        });
      })
      .on('mouseleave', () => {
        setHoveredModel(null);
        cardGroup.selectAll('g').style('opacity', 1);
        linkGroup.selectAll('g.relation-link').style('opacity', 1);
      });

    // Card background
    cards
      .append('rect')
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height)
      .attr('x', (d) => -d.width / 2)
      .attr('y', (d) => -d.height / 2)
      .attr('fill', CARD_BG)
      .attr('stroke', CARD_BORDER)
      .attr('stroke-width', 1)
      .attr('rx', 8);

    // Card header
    cards
      .append('rect')
      .attr('width', (d) => d.width)
      .attr('height', 40)
      .attr('x', (d) => -d.width / 2)
      .attr('y', (d) => -d.height / 2)
      .attr('fill', 'rgba(168, 85, 247, 0.2)')
      .attr('rx', 8);

    // Header text
    cards
      .append('text')
      .attr('x', (d) => -d.width / 2 + 12)
      .attr('y', (d) => -d.height / 2 + 25)
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .attr('fill', TEXT_COLOR)
      .attr('font-family', 'system-ui, sans-serif')
      .text((d) => d.name);

    // Fields
    cards.each(function (d) {
      const card = d3.select(this);
      const startY = -d.height / 2 + 56;

      d.fields.forEach((field, index) => {
        const y = startY + index * 24;

        // Field icon
        if (field.isId) {
          card
            .append('text')
            .attr('x', -d.width / 2 + 12)
            .attr('y', y)
            .attr('font-size', '12px')
            .attr('fill', ID_COLOR)
            .text('⚿');
        } else if (field.isRelation) {
          card
            .append('text')
            .attr('x', -d.width / 2 + 12)
            .attr('y', y)
            .attr('font-size', '12px')
            .attr('fill', RELATION_COLOR)
            .text('🔗');
        } else {
          card
            .append('text')
            .attr('x', -d.width / 2 + 12)
            .attr('y', y)
            .attr('font-size', '12px')
            .attr('fill', TEXT_MUTED)
            .text('•');
        }

        // Field name
        card
          .append('text')
          .attr('x', -d.width / 2 + 28)
          .attr('y', y)
          .attr('font-size', '11px')
          .attr('fill', field.isId ? ID_COLOR : TEXT_COLOR)
          .attr('font-family', 'system-ui, sans-serif')
          .text(field.name);

        // Field type
        card
          .append('text')
          .attr('x', d.width / 2 - 12)
          .attr('y', y)
          .attr('font-size', '10px')
          .attr('fill', TEXT_MUTED)
          .attr('text-anchor', 'end')
          .attr('font-family', 'system-ui, sans-serif')
          .text(field.type);
      });
    });

    svg.on('click', () => setSelectedModel(null));

    simulation.on('tick', () => {
      // Update card positions
      cards.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);

      // Update relation paths
      const buildRelationPath = (d: SchemaRelation): string => {
        const sourceNode = nodeById.get(d.source);
        const targetNode = nodeById.get(d.target);

        if (!sourceNode || !targetNode || sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) {
          return '';
        }

        const start = getCardBorderPoint(sourceNode, targetNode);
        const end = getCardBorderPoint(targetNode, sourceNode);
        const curveOffset = relationCurveOffsets.get(d) || 0;
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 1) {
          return `M${start.x},${start.y} L${end.x},${end.y}`;
        }

        const normalX = -dy / distance;
        const normalY = dx / distance;
        const curveX = mx + normalX * curveOffset;
        const curveY = my + normalY * curveOffset;

        return `M${start.x},${start.y} Q${curveX},${curveY} ${end.x},${end.y}`;
      };

      linkBackdrops.attr('d', (d) => buildRelationPath(d));

      links.attr('d', (d) => {
        return buildRelationPath(d);
      });

      sourceDots
        .attr('cx', (d) => {
          const sourceNode = nodeById.get(d.source);
          const targetNode = nodeById.get(d.target);

          if (!sourceNode || !targetNode || sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) {
            return 0;
          }

          return getCardBorderPoint(sourceNode, targetNode).x;
        })
        .attr('cy', (d) => {
          const sourceNode = nodeById.get(d.source);
          const targetNode = nodeById.get(d.target);

          if (!sourceNode || !targetNode || sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) {
            return 0;
          }

          return getCardBorderPoint(sourceNode, targetNode).y;
        });
    });

    return () => {
      simulation.stop();
    };
  }, [models, relations, dimensions]);

  if (models.length === 0) {
    return (
      <div className="no-results" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '14px', gap: '8px' }}>
        <p>No database schema found. This project may not use Prisma or Drizzle.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', background: BG_COLOR }} />
      {hoveredModel && <HoverCard model={hoveredModel} />}
      <Legend />
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
        {models.length} models • {relations.length} relations
      </div>
    </div>
  );
}

function HoverCard({ model }: { model: SchemaModel }) {
  const idFields = model.fields.filter((f) => f.isId).length;
  const relationFields = model.fields.filter((f) => f.isRelation).length;

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
            borderRadius: '8px',
            background: 'rgba(168, 85, 247, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '14px',
            color: RELATION_COLOR,
          }}
        >
          {model.name[0]}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '16px', color: TEXT_COLOR }}>{model.name}</div>
          <div style={{ fontSize: '11px', color: TEXT_MUTED }}>
            {model.fields.length} fields
            {idFields > 0 && ` • ${idFields} key${idFields > 1 ? 's' : ''}`}
            {relationFields > 0 && ` • ${relationFields} relation${relationFields > 1 ? 's' : ''}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend() {
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
        Schema Legend
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: ID_COLOR, fontSize: '14px' }}>⚿</span>
          <span style={{ fontSize: '11px' }}>Primary Key</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: RELATION_COLOR, fontSize: '14px' }}>🔗</span>
          <span style={{ fontSize: '11px' }}>Relation</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: TEXT_MUTED, fontSize: '14px' }}>•</span>
          <span style={{ fontSize: '11px' }}>Regular Field</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '2px', background: RELATION_COLOR }} />
          <span style={{ fontSize: '11px' }}>One-to-Many</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '20px',
              height: '2px',
              background: 'repeating-linear-gradient(to right, ' + RELATION_COLOR + ', ' + RELATION_COLOR + ' 4px, transparent 4px, transparent 8px)',
            }}
          />
          <span style={{ fontSize: '11px' }}>Many-to-Many</span>
        </div>
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
        Scroll to zoom • Drag to pan • Click to select • Hover to highlight
      </div>
    </div>
  );
}
