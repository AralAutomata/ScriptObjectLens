'use client';

import { useMemo, useState } from 'react';
import { analyzeProject, AnalyzeResponse } from '@/lib/api';
import Graph from '@/components/Graph';
import NodeDetails from '@/components/NodeDetails';
import SearchBar from '@/components/SearchBar';
import ExportControls from '@/components/ExportControls';
import './page.css';

type NodeType = 'class' | 'interface' | 'abstract' | 'enum' | 'typeAlias' | 'function';
type RelationFilter = 'all' | 'inheritance' | 'dependency' | 'imports';
type DegreeFilter = 'all' | 'high' | 'cycle';
type EdgeType = 'extends' | 'implements' | 'composition' | 'uses' | 'imports';
type ViewMode = 'graph' | 'clusters';

interface MethodInfo {
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
}

interface PropertyInfo {
  name: string;
  type: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  namespace: string;
  filePath: string;
  extends?: string;
  implements: string[];
  methods: MethodInfo[];
  properties: PropertyInfo[];
  methodCount: number;
  propertyCount: number;
  inheritanceDepth: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  inDegree?: number;
  outDegree?: number;
  totalDegree?: number;
  isCycleNode?: boolean;
  clusterId?: number;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: EdgeType;
  label?: string;
}

interface ClusterStats {
  clusterId: string | number;
  nodes: GraphNode[];
  totalEdges: number;
  internalEdges: number;
  externalEdges: number;
  cycleCount: number;
  relationBreakdown: {
    extends: number;
    implements: number;
    composition: number;
    uses: number;
    imports: number;
  };
}

interface AnalysisResult {
  id: string;
  scanPath: string;
  classes: any[];
  relationships: any[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  totalFiles: number;
  totalClasses: number;
  totalInterfaces: number;
  totalEnums?: number;
  totalTypeAliases?: number;
  totalFunctions?: number;
}

function resolveNodeType(type: string): NodeType {
  if (type === 'typeAlias' || type === 'function' || type === 'enum' || type === 'abstract' || type === 'interface') {
    return type as NodeType;
  }
  return 'class';
}

export default function Home() {
  const [scanPath, setScanPath] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | NodeType>('all');
  const [relationFilter, setRelationFilter] = useState<RelationFilter>('inheritance');
  const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('all');
  const [simpleMode, setSimpleMode] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');

  const isHighDegree = (node: GraphNode): boolean => ((node.inDegree || 0) + (node.outDegree || 0)) >= 3;

  const relationMatchesFilter = (edge: GraphEdge): boolean => {
    if (relationFilter === 'all') return true;
    if (relationFilter === 'imports') return edge.type === 'imports';
    if (relationFilter === 'inheritance') {
      return edge.type === 'extends' || edge.type === 'implements';
    }
    return edge.type === 'composition' || edge.type === 'uses';
  };

  const degreeMatchesFilter = (node: GraphNode): boolean => {
    if (degreeFilter === 'all') return true;
    if (degreeFilter === 'high') return isHighDegree(node);
    return !!node.isCycleNode;
  };

  const handleAnalyze = async () => {
    if (!scanPath.trim()) {
      setError('Please enter a path to analyze');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setSelectedNode(null);

    try {
      const response: AnalyzeResponse = await analyzeProject({ path: scanPath });

      if (response.success && response.result) {
        const classes = response.result.classes || [];
        const relationships = response.result.relationships || [];
        const graphById = new Map(response.result.graph.nodes.map((node: any) => [node.id, node]));

        const calculateDepth = (classId: string, visited: Set<string> = new Set()): number => {
          if (visited.has(classId)) return 0;
          visited.add(classId);

          const extendsRel = relationships.find((r: any) => r.source === classId && r.type === 'extends');
          if (extendsRel) {
            return 1 + calculateDepth(extendsRel.target, visited);
          }
          return 0;
        };

        const enhancedNodes: GraphNode[] = classes.map((c: any) => {
          const graphNode = graphById.get(c.id) || {};
          return {
            id: c.id,
            label: c.name,
            type: resolveNodeType(c.type),
            namespace: c.namespace || '',
            filePath: c.filePath,
            extends: c.extends,
            implements: c.implements || [],
            methods: c.methods || [],
            properties: c.properties || [],
            methodCount: (c.methods || []).length,
            propertyCount: (c.properties || []).length,
            inheritanceDepth: calculateDepth(c.id),
            inDegree: graphNode.inDegree || 0,
            outDegree: graphNode.outDegree || 0,
            totalDegree: graphNode.totalDegree || 0,
            isCycleNode: !!graphNode.isCycleNode,
            clusterId: graphNode.clusterId
          };
        });

        const enhancedResult: AnalysisResult = {
          ...response.result,
          graph: {
            ...response.result.graph,
            nodes: enhancedNodes
          }
        };

        setResult(enhancedResult);
      } else {
        setError(response.error || 'Analysis failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to server');
    } finally {
      setAnalyzing(false);
    }
  };

  const getFilteredNodes = (): GraphNode[] => {
    if (!result) return [];

    let nodes = result.graph.nodes;

    if (filterType !== 'all') {
      nodes = nodes.filter((n) => n.type === filterType);
    } else if (simpleMode) {
      nodes = nodes.filter((n) => n.type === 'class' || n.type === 'interface' || n.type === 'abstract');
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      nodes = nodes.filter((n) =>
        n.label.toLowerCase().includes(query) ||
        n.namespace.toLowerCase().includes(query)
      );
    }

    nodes = nodes.filter((node) => degreeMatchesFilter(node));

    const normalizedNodes = nodes.map((node, index) => ({
      ...node,
      id: node.id || `__node-${index}`
    }));

    const uniqueById = new Map<string, GraphNode>();
    normalizedNodes.forEach((node) => {
      const nodeId = node.id;
      if (!uniqueById.has(nodeId)) {
        uniqueById.set(nodeId, node);
      }
    });

    return [...uniqueById.values()];
  };

  const filteredNodes = useMemo(() => getFilteredNodes(), [result, filterType, simpleMode, searchQuery, degreeFilter]);
  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    if (!result) return [];

    const dedupe = new Set<string>();
    return result.graph.edges.filter((e) => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;
      const edgeKey = `${sourceId}->${targetId}:${e.type}`;

      if (!filteredNodeIds.has(sourceId) || !filteredNodeIds.has(targetId) || dedupe.has(edgeKey)) {
        return false;
      }

      dedupe.add(edgeKey);

      if (simpleMode) {
        return e.type === 'extends' || e.type === 'implements';
      }
      return relationMatchesFilter(e);
    });
  }, [result, filteredNodeIds, simpleMode, relationFilter]);

  const clusteredData = useMemo(() => {
    if (filteredNodes.length === 0) return [];

    const clusters = new Map<string | number, ClusterStats>();
    const nodeToCluster = new Map<string, string | number>();
    const seenNodeIds = new Set<string>();

    filteredNodes.forEach((node) => {
      if (seenNodeIds.has(node.id)) {
        return;
      }
      seenNodeIds.add(node.id);

      const clusterKey = node.clusterId ?? 'unclustered';
      nodeToCluster.set(node.id, clusterKey);

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, {
          clusterId: clusterKey,
          nodes: [],
          totalEdges: 0,
          internalEdges: 0,
          externalEdges: 0,
          cycleCount: 0,
          relationBreakdown: {
            extends: 0,
            implements: 0,
            composition: 0,
            uses: 0,
            imports: 0
          }
        });
      }

      const cluster = clusters.get(clusterKey);
      if (cluster) {
        cluster.nodes.push(node);
        if (node.isCycleNode) cluster.cycleCount += 1;
      }
    });

    const sortedEdge = filteredEdges.map((edge) => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      return { edge, sourceId, targetId };
    });

    sortedEdge.forEach(({ edge, sourceId, targetId }) => {
      const sourceCluster = nodeToCluster.get(sourceId);
      const targetCluster = nodeToCluster.get(targetId);
      if (!sourceCluster || !targetCluster) return;

      const sourceClusterData = clusters.get(sourceCluster);
      const targetClusterData = clusters.get(targetCluster);
      if (!sourceClusterData || !targetClusterData) return;

      sourceClusterData.totalEdges += 1;
      targetClusterData.totalEdges += 1;

      if (sourceCluster === targetCluster) {
        sourceClusterData.internalEdges += 1;
      } else {
        sourceClusterData.externalEdges += 1;
        targetClusterData.externalEdges += 1;
      }

      if (edge.type === 'extends') sourceClusterData.relationBreakdown.extends += 1;
      if (edge.type === 'implements') sourceClusterData.relationBreakdown.implements += 1;
      if (edge.type === 'composition') sourceClusterData.relationBreakdown.composition += 1;
      if (edge.type === 'uses') sourceClusterData.relationBreakdown.uses += 1;
      if (edge.type === 'imports') sourceClusterData.relationBreakdown.imports += 1;
    });

    const clustersArray = [...clusters.values()];
    clustersArray.forEach((cluster) => {
      cluster.nodes.sort((a, b) => (b.totalDegree || 0) - (a.totalDegree || 0));
    });

    return clustersArray.sort((a, b) => {
      if (b.nodes.length !== a.nodes.length) return b.nodes.length - a.nodes.length;
      return a.clusterId.toString().localeCompare(b.clusterId.toString());
    });
  }, [filteredNodes, filteredEdges]);

  const hasHighDegree = result?.graph.nodes.some((n) => isHighDegree(n)) ?? false;
  const cycleCount = result?.graph.nodes.filter((n) => n.isCycleNode).length || 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Code Structure Visualizer</h1>
          <p className="subtitle">Visualize object-oriented architecture in TypeScript/JavaScript</p>
        </div>
        <div className="header-badge">
          <span>TS/JS</span>
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="sidebar-content">
            <div className="input-section">
              <label className="input-label">Project Path</label>
              <div className="input-group">
                <input
                  type="text"
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  placeholder="/home/user/my-project"
                  className="path-input"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="analyze-btn"
                >
                  {analyzing ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
              <p className="input-hint">Paste the full absolute path to your project</p>
              {error && <p className="error">{error}</p>}
            </div>

            {result && (
              <>
                <div className="stats">
                  <div className="stat">
                    <span className="stat-value">{result.totalFiles}</span>
                    <span className="stat-label">Files</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{result.totalClasses}</span>
                    <span className="stat-label">Classes</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{result.totalInterfaces}</span>
                    <span className="stat-label">Interfaces</span>
                  </div>
                </div>

                <SearchBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  filterType={filterType}
                  onFilterChange={setFilterType}
                  relationFilter={relationFilter}
                  onRelationChange={setRelationFilter}
                  degreeFilter={degreeFilter}
                  onDegreeFilterChange={setDegreeFilter}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  simpleMode={simpleMode}
                  onSimpleModeChange={setSimpleMode}
                />

                <div style={{
                  padding: '12px 16px',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  <div style={{ marginBottom: '4px' }}>
                    {result.totalEnums ? `Enums: ${result.totalEnums}` : ''}
                    {result.totalTypeAliases ? `  • Types: ${result.totalTypeAliases}` : ''}
                    {result.totalFunctions ? `  • Functions: ${result.totalFunctions}` : ''}
                  </div>
                  <div>
                    {hasHighDegree ? `High-degree nodes: ${result.graph.nodes.filter((n) => isHighDegree(n)).length}` : 'No high-degree nodes'}
                    {cycleCount > 0 ? `  •  Cycles: ${cycleCount}` : ''}
                  </div>
                </div>

                <ExportControls
                  result={result}
                  filteredNodes={filteredNodes}
                  filteredNodeIds={filteredNodeIds}
                />
              </>
            )}
          </div>
        </div>

        <div className="graph-container">
          {result && filteredNodes.length > 0 ? (
            viewMode === 'graph' ? (
              <Graph
                nodes={filteredNodes}
                edges={filteredEdges}
                onNodeClick={setSelectedNode}
                simpleMode={simpleMode}
                selectedNodeId={selectedNode?.id}
              />
            ) : (
              <div className="cluster-view">
                {clusteredData.map((cluster) => {
                  const summary = [
                    cluster.relationBreakdown.extends > 0 ? `Extends: ${cluster.relationBreakdown.extends}` : null,
                    cluster.relationBreakdown.implements > 0 ? `Implements: ${cluster.relationBreakdown.implements}` : null,
                    cluster.relationBreakdown.composition > 0 ? `Composition: ${cluster.relationBreakdown.composition}` : null,
                    cluster.relationBreakdown.uses > 0 ? `Uses: ${cluster.relationBreakdown.uses}` : null,
                    cluster.relationBreakdown.imports > 0 ? `Imports: ${cluster.relationBreakdown.imports}` : null
                  ].filter(Boolean) as string[];

                  return (
                    <section className="cluster-card" key={`cluster-${cluster.clusterId}`}>
                      <header className="cluster-header">
                        <h3>Cluster {cluster.clusterId}</h3>
                        <p>
                          {cluster.nodes.length} nodes
                          {cluster.internalEdges > 0 ? ` • ${cluster.internalEdges} internal edges` : ''}
                          {cluster.externalEdges > 0 ? ` • ${cluster.externalEdges} external edges` : ''}
                        </p>
                      </header>
                      {cluster.cycleCount > 0 ? (
                        <div className="cluster-meta">
                          {cluster.cycleCount} cycle node{cluster.cycleCount > 1 ? 's' : ''}
                        </div>
                      ) : null}
                      {summary.length > 0 ? (
                        <div className="cluster-meta">
                          {summary.join(' • ')}
                        </div>
                      ) : null}
                      <div className="cluster-table">
                        <div className="cluster-table-head">
                          <span className="cluster-cell cluster-cell-type">Type</span>
                          <span className="cluster-cell cluster-cell-name">Node</span>
                          <span className="cluster-cell">In</span>
                          <span className="cluster-cell">Out</span>
                          <span className="cluster-cell cluster-cell-flags">Tags</span>
                        </div>
                        {cluster.nodes.map((node, index) => (
                          <button
                            key={`${cluster.clusterId}-${node.id}-${index}`}
                            className="cluster-node-row"
                            type="button"
                            onClick={() => setSelectedNode(node)}
                            aria-label={`Open ${node.label} details`}
                          >
                            <span className={`cluster-node-type ${node.type === 'typeAlias' ? 'typealias' : node.type}`}>
                              {node.type.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="cluster-node-name">{node.label}</span>
                            <span className="cluster-cell cluster-cell-number">{node.inDegree || 0}</span>
                            <span className="cluster-cell cluster-cell-number">{node.outDegree || 0}</span>
                            <span className="cluster-cell cluster-cell-flags">
                              {node.isCycleNode ? 'cycle' : ' '}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )
          ) : result ? (
            <div className="no-results">
              <p>No classes or interfaces match your search.</p>
            </div>
          ) : (
            <div className="placeholder">
              <div className="placeholder-icon">📊</div>
              <p>Enter a project path and click Analyze to visualize the structure</p>
            </div>
          )}
        </div>

        {selectedNode && result && (
          <NodeDetails
            node={selectedNode}
            result={result}
            analysisId={result.id}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
