export type EntityType = "class" | "interface" | "abstract" | "enum" | "typeAlias" | "function";

export type GraphNodeType = "class" | "interface" | "abstract" | "enum" | "typeAlias" | "function";

export interface ClassInfo {
  id: string;
  name: string;
  namespace: string;
  filePath: string;
  type: EntityType;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  decorators: DecoratorInfo[];
  extends?: string;
  implements: string[];
  references?: string[];
  imports?: string[];
  signature?: string;
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
  type: "extends" | "implements" | "composition" | "uses" | "imports";
  filePath?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  namespace: string;
  filePath: string;
  inDegree?: number;
  outDegree?: number;
  totalDegree?: number;
  isCycleNode?: boolean;
  clusterId?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "extends" | "implements" | "composition" | "uses" | "imports";
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
  totalEnums?: number;
  totalTypeAliases?: number;
  totalFunctions?: number;
  totalEntities?: number;
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
