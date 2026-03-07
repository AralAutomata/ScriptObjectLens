'use client';

import { useState } from 'react';
import { analyzeProject, AnalyzeResponse } from '@/lib/api';
import Graph from '@/components/Graph';
import NodeDetails from '@/components/NodeDetails';
import SearchBar from '@/components/SearchBar';
import ExportControls from '@/components/ExportControls';
import './page.css';

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
  const [filterType, setFilterType] = useState<'all' | 'class' | 'interface'>('all');

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
        setResult(response.result as AnalysisResult);
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
      nodes = nodes.filter(n => n.type === filterType);
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
        <h1>Code Structure Visualizer</h1>
        <p className="subtitle">Visualize object-oriented architecture in TypeScript/JavaScript</p>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="input-section">
            <div className="input-group">
              <input
                type="text"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                placeholder="Enter absolute path (e.g., /home/user/my-project)"
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
            <p className="input-hint">Paste the full path to your TypeScript/JavaScript project directory</p>
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
