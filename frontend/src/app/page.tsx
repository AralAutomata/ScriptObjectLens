'use client';

import { useState } from 'react';
import { analyzeProject, AnalyzeResponse } from '@/lib/api';
import Graph from '@/components/Graph';
import NodeDetails from '@/components/NodeDetails';
import SearchBar from '@/components/SearchBar';
import ExportControls from '@/components/ExportControls';
import './page.css';

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
}

export default function Home() {
  const [scanPath, setScanPath] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'class' | 'interface' | 'abstract'>('all');

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
        // Transform data to include OOP metadata
        const classes = response.result.classes || [];
        const relationships = response.result.relationships || [];
        
        // Calculate inheritance depth for each class
        const calculateDepth = (classId: string, visited: Set<string> = new Set()): number => {
          if (visited.has(classId)) return 0;
          visited.add(classId);
          
          const extendsRel = relationships.find((r: any) => r.source === classId && r.type === 'extends');
          if (extendsRel) {
            return 1 + calculateDepth(extendsRel.target, visited);
          }
          return 0;
        };
        
        // Build enhanced graph data
        const enhancedNodes: GraphNode[] = classes.map((c: any) => ({
          id: c.id,
          label: c.name,
          type: c.type === 'abstract' ? 'abstract' : c.type === 'interface' ? 'interface' : 'class',
          namespace: c.namespace || '',
          filePath: c.filePath,
          extends: c.extends,
          implements: c.implements || [],
          methods: c.methods || [],
          properties: c.properties || [],
          methodCount: (c.methods || []).length,
          propertyCount: (c.properties || []).length,
          inheritanceDepth: calculateDepth(c.id)
        }));
        
        const enhancedEdges: GraphEdge[] = relationships.map((r: any) => ({
          source: r.source,
          target: r.target,
          type: r.type,
          label: r.type
        }));
        
        const enhancedResult: AnalysisResult = {
          ...response.result as AnalysisResult,
          graph: {
            nodes: enhancedNodes,
            edges: enhancedEdges
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
      if (filterType === 'abstract') {
        nodes = nodes.filter(n => n.type === 'abstract');
      } else {
        nodes = nodes.filter(n => n.type === filterType);
      }
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      nodes = nodes.filter(n => 
        n.label.toLowerCase().includes(query) ||
        n.namespace.toLowerCase().includes(query)
      );
    }
    
    return nodes;
  };

  const filteredNodes = getFilteredNodes();
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

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
              />

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
            <Graph
              nodes={filteredNodes}
              edges={result.graph.edges.filter(e => {
                const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
                const targetId = typeof e.target === 'string' ? e.target : e.target.id;
                return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
              })}
              onNodeClick={setSelectedNode}
              selectedNodeId={selectedNode?.id}
            />
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
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
