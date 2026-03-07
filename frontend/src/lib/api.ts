const API_BASE = '/api';

export interface AnalyzeRequest {
  path: string;
  exclude?: string[];
  include?: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  result?: {
    id: string;
    timestamp: number;
    scanPath: string;
    classes: any[];
    relationships: any[];
    graph: {
      nodes: any[];
      edges: any[];
    };
    totalFiles: number;
    totalClasses: number;
    totalInterfaces: number;
  };
  error?: string;
}

export async function analyzeProject(data: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function getAnalysisResult(id: string): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/result/${id}`);
  return response.json();
}

export async function getEntityDetails(id: string): Promise<any> {
  const response = await fetch(`${API_BASE}/entity/${id}`);
  return response.json();
}

export async function getFileContent(filePath: string): Promise<{ success: boolean; content?: string }> {
  const response = await fetch(`${API_BASE}/file?path=${encodeURIComponent(filePath)}`);
  return response.json();
}
