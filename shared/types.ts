export interface ClassInfo {
  id: string;
  name: string;
  namespace: string;
  filePath: string;
  type: "class" | "interface" | "abstract";
  methods: MethodInfo[];
  properties: PropertyInfo[];
  decorators: DecoratorInfo[];
  extends?: string;
  implements: string[];
  startLine: number;
  endLine: number;
}

export interface MethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  accessModifier: "public" | "private" | "protected" | "";
  isStatic: boolean;
  isAbstract: boolean;
  decorators: DecoratorInfo[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  accessModifier: "public" | "private" | "protected" | "";
  isStatic: boolean;
  isReadonly: boolean;
  decorators: DecoratorInfo[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

export interface DecoratorInfo {
  name: string;
  arguments: Record<string, unknown>;
}

export interface Relationship {
  source: string;
  target: string;
  type: "extends" | "implements" | "composition";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "class" | "interface";
  namespace: string;
  filePath: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "extends" | "implements" | "composition";
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  scanPath: string;
  classes: ClassInfo[];
  relationships: Relationship[];
  graph: GraphData;
  totalFiles: number;
  totalClasses: number;
  totalInterfaces: number;
}

export interface AnalyzeRequest {
  path: string;
  exclude?: string[];
  include?: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}

export interface EntityDetails {
  class: ClassInfo;
  relatedClasses: ClassInfo[];
  relationships: Relationship[];
}
