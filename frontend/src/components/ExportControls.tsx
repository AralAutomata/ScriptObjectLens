'use client';

import './ExportControls.css';

interface GraphNode {
  id: string;
  label: string;
  type: 'class' | 'interface' | 'abstract';
}

interface ExportControlsProps {
  result: {
    classes: any[];
    relationships: any[];
    graph: {
      nodes: GraphNode[];
      edges: any[];
    };
    scanPath: string;
    totalFiles: number;
    totalClasses: number;
    totalInterfaces: number;
  };
  filteredNodes: GraphNode[];
  filteredNodeIds: Set<string>;
}

export default function ExportControls({ result, filteredNodes, filteredNodeIds }: ExportControlsProps) {
  const exportJSON = () => {
    const filteredEdges = result.graph.edges.filter(e => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;
      return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
    });

    const data = {
      metadata: {
        scanPath: result.scanPath,
        totalFiles: result.totalFiles,
        totalClasses: result.totalClasses,
        totalInterfaces: result.totalInterfaces,
        exportedAt: new Date().toISOString()
      },
      nodes: filteredNodes,
      edges: filteredEdges
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-structure-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSVG = () => {
    const svg = document.querySelector('.graph-container svg');
    if (!svg) return;

    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.style.background = '#0f172a';
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-graph-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    const svg = document.querySelector('.graph-container svg');
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    canvas.width = svg.clientWidth * 2;
    canvas.height = svg.clientHeight * 2;
    
    img.onload = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `code-graph-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="export-controls">
      <h3>Export</h3>
      <div className="export-buttons">
        <button className="export-btn" onClick={exportJSON}>
          <span className="export-icon">📄</span>
          JSON
        </button>
        <button className="export-btn" onClick={exportSVG}>
          <span className="export-icon">🎨</span>
          SVG
        </button>
        <button className="export-btn" onClick={exportPNG}>
          <span className="export-icon">🖼️</span>
          PNG
        </button>
      </div>
    </div>
  );
}
