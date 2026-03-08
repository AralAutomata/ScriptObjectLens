import * as ts from "typescript";
import { ClassInfo, MethodInfo, PropertyInfo, ParameterInfo, DecoratorInfo } from "../shared/types.ts";

function fileExists(path: string): boolean {
  try {
    const stat = Deno.statSync(path);
    if (stat.isSymlink) {
      return false;
    }
    return stat.isFile;
  } catch {
    return false;
  }
}

function readFile(path: string): string | undefined {
  try {
    const stat = Deno.statSync(path);
    if (stat.isSymlink) {
      return undefined;
    }
    return Deno.readTextFileSync(path);
  } catch {
    return undefined;
  }
}

function isSymlink(path: string): boolean {
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

export class TypeScriptParser {
  private program: ts.Program | null = null;
  private typeChecker: ts.TypeChecker | null = null;
  private sourceFiles: Map<string, ts.SourceFile> = new Map();
  private scanPath: string = "";

  async parseDirectory(dirPath: string, options?: {
    exclude?: string[];
    include?: string[];
  }): Promise<void> {
    // Resolve to absolute path
    this.scanPath = Deno.realPathSync(dirPath);
    
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
    };

    const tsconfigPath = this.scanPath + "/tsconfig.json";
    if (fileExists(tsconfigPath)) {
      const content = readFile(tsconfigPath);
      if (content) {
        try {
          const config = JSON.parse(content);
          if (config.compilerOptions) {
            const parsed = ts.parseJsonConfigFileContent(
              config,
              ts.sys,
              dirPath
            );
            compilerOptions = { ...compilerOptions, ...parsed.options };
          }
        } catch (e) {
          console.log("tsconfig parse error:", e);
        }
      }
    }

    const defaultIncludes = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
    const includes = options?.include || defaultIncludes;
    const excludes = [
      "node_modules", 
      "dist", 
      "build", 
      ".git", 
      ".cache",
      "deno",
      ".next",
      ".nuxt",
      ".output",
      ...(options?.exclude || [])
    ];

    const fileNames = await this.findFiles(dirPath, includes, excludes);
    
    if (fileNames.length === 0) {
      console.warn("No TypeScript/JavaScript files found in the specified directory.");
    }

    this.program = ts.createProgram(fileNames, compilerOptions);
    this.typeChecker = this.program.getTypeChecker();
    
    // Store all source files from user directory
    const scanDir = this.scanPath.replace(/\\/g, '/');
    this.program.getSourceFiles().forEach(sf => {
      const sfPath = sf.fileName.replace(/\\/g, '/');
      if (sfPath.startsWith(scanDir)) {
        this.sourceFiles.set(sf.fileName, sf);
      }
    });
  }

  private async findFiles(dirPath: string, includes: string[], excludes: string[]): Promise<string[]> {
    const files: string[] = [];
    const basePath = Deno.realPathSync(dirPath);
    
    const walkDir = async (dir: string) => {
      try {
        for await (const entry of Deno.readDir(dir)) {
          const fullPath = `${dir}/${entry.name}`;
          
          if (isSymlink(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory) {
            if (!excludes.some(exc => fullPath.includes(exc))) {
              await walkDir(fullPath);
            }
          } else if (entry.isFile) {
            const ext = entry.name.split('.').pop()?.toLowerCase();
            if (ext && ['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (e) {
        console.error(`Error reading directory ${dir}:`, e);
      }
    };
    
    await walkDir(dirPath);
    return files;
  }

  extractClassesAndInterfaces(): ClassInfo[] {
    const classes: ClassInfo[] = [];
    
    if (!this.program) {
      return classes;
    }

    const scanDir = this.scanPath.replace(/\\/g, '/');
    
    for (const sourceFile of this.program.getSourceFiles()) {
      const sfPath = sourceFile.fileName.replace(/\\/g, '/');
      
      // Skip node_modules, deno cache, and other system files
      if (sfPath.includes('/node_modules/') || 
          sfPath.includes('/.cache/') ||
          sfPath.includes('/deno/') ||
          sfPath.includes('lib.es5') ||
          sfPath.includes('lib.dom')) {
        continue;
      }
      
      // Only include files in the scanned directory
      if (!sfPath.startsWith(scanDir)) {
        continue;
      }
      
      ts.forEachChild(sourceFile, node => {
        if (ts.isClassDeclaration(node)) {
          const classInfo = this.extractClassInfo(node, sourceFile);
          if (classInfo) {
            classes.push(classInfo);
          }
        } else if (ts.isInterfaceDeclaration(node)) {
          const classInfo = this.extractInterfaceInfo(node, sourceFile);
          if (classInfo) {
            classes.push(classInfo);
          }
        }
      });
    }

    return classes;
  }

  private extractClassInfo(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassInfo | null {
    if (!node.name) return null;

    const name = node.name.getText();
    const id = this.generateId(name, sourceFile.fileName);
    const namespace = this.extractNamespace(sourceFile, node);
    const filePath = sourceFile.fileName;

    const extendsClause = node.heritageClauses?.find(hc => hc.token === ts.SyntaxKind.ExtendsKeyword);
    const extendsName = extendsClause?.types[0] ? this.getTextWithType(extendsClause.types[0], sourceFile) : undefined;

    const implementsClause = node.heritageClauses?.find(hc => hc.token === ts.SyntaxKind.ImplementsKeyword);
    const implementsNames = implementsClause?.types.map(t => this.getTextWithType(t, sourceFile)) || [];

    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasAbstractKeyword = modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword) || false;
    
    // Also detect abstract by naming convention (Base, Abstract prefixes)
    // Use word boundary to avoid false positives like "BaseballTeam", "Baseline"
    const isAbstractByName = /^(?:Base|Abstract)(?=[A-Z])/.test(name);
    
    // Class is abstract if it has abstract keyword OR follows naming convention
    const isAbstract = hasAbstractKeyword || isAbstractByName;

    const methods = this.extractMethods(node, sourceFile);
    const properties = this.extractProperties(node, sourceFile);
    const decorators = this.extractDecorators(node, sourceFile);

    const { startLine, endLine } = this.getLineNumbers(node, sourceFile);

    return {
      id,
      name,
      namespace,
      filePath,
      type: isAbstract ? "abstract" : "class",
      methods,
      properties,
      decorators,
      extends: extendsName,
      implements: implementsNames,
      startLine,
      endLine
    };
  }

  private extractInterfaceInfo(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile): ClassInfo | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const id = this.generateId(name, sourceFile.fileName);
    const namespace = this.extractNamespace(sourceFile, node);
    const filePath = sourceFile.fileName;

    const extendsClause = node.heritageClauses?.find(hc => hc.token === ts.SyntaxKind.ExtendsKeyword);
    const extendsNames = extendsClause?.types.map(t => this.getTextWithType(t, sourceFile)) || [];

    const methods: MethodInfo[] = [];
    const properties: PropertyInfo[] = [];

    node.members.forEach(member => {
      if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
        const methodName = member.name.getText(sourceFile);
        const params = this.extractParameterInfo(member.parameters, sourceFile);
        const returnType = member.type ? this.getTextWithType(member.type, sourceFile) : "any";
        methods.push({
          name: methodName,
          parameters: params,
          returnType,
          accessModifier: "",
          isStatic: false,
          isAbstract: false,
          decorators: []
        });
      } else if (ts.isPropertySignature(member)) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? this.getTextWithType(member.type, sourceFile) : "any";
        const isOptional = member.questionToken !== undefined;
        properties.push({
          name: propName,
          type: isOptional ? `${propType}?` : propType,
          accessModifier: "",
          isStatic: false,
          isReadonly: member.questionToken === undefined && !!member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword),
          decorators: []
        });
      }
    });

    const { startLine, endLine } = this.getLineNumbers(node, sourceFile);

    return {
      id,
      name,
      namespace,
      filePath,
      type: "interface",
      methods,
      properties,
      decorators: [],
      extends: undefined,
      implements: extendsNames,
      startLine,
      endLine
    };
  }

  private extractMethods(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): MethodInfo[] {
    const methods: MethodInfo[] = [];

    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        const methodName = member.name.getText(sourceFile);
        const params = this.extractParameterInfo(member.parameters, sourceFile);
        const returnType = member.type ? this.getTextWithType(member.type, sourceFile) : "any";

        const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
        const accessModifier = this.getAccessModifier(modifiers);
        const isStatic = modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || false;
        const isAbstract = modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword) || false;

        const decorators = this.extractDecorators(member, sourceFile);

        methods.push({
          name: methodName,
          parameters: params,
          returnType,
          accessModifier,
          isStatic,
          isAbstract,
          decorators
        });
      }
    }

    return methods;
  }

  private extractProperties(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member)) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? this.getTextWithType(member.type, sourceFile) : "any";

        const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
        const accessModifier = this.getAccessModifier(modifiers);
        const isStatic = modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || false;
        const isReadonly = modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword) || false;

        const decorators = this.extractDecorators(member, sourceFile);

        let type = propType;
        if (member.questionToken) type += "?";
        if (member.exclamationToken) type += "!";

        properties.push({
          name: propName,
          type,
          accessModifier,
          isStatic,
          isReadonly,
          decorators
        });
      }
    }

    return properties;
  }

  private extractParameterInfo(params: ts.NodeArray<ts.ParameterDeclaration>, sourceFile: ts.SourceFile): ParameterInfo[] {
    return params.map(param => {
      const name = param.name.getText(sourceFile);
      const type = param.type ? this.getTextWithType(param.type, sourceFile) : "any";
      const optional = param.questionToken !== undefined;
      const defaultValue = param.initializer ? param.initializer.getText(sourceFile) : undefined;

      return { name, type, optional, defaultValue };
    });
  }

  private extractDecorators(node: ts.HasDecorators, sourceFile: ts.SourceFile): DecoratorInfo[] {
    const decorators: DecoratorInfo[] = [];
    const decList = ts.getDecorators(node);

    if (decList) {
      for (const dec of decList) {
        const fullText = dec.getText(sourceFile);
        const match = fullText.match(/^@(\w+)(?:\((.*)\))?/);
        if (match) {
          const name = match[1];
          let arguments_: Record<string, unknown> = {};
          
          if (match[2]) {
            try {
              arguments_ = JSON.parse(match[2]);
            } catch {
              arguments_ = { raw: match[2] };
            }
          }
          
          decorators.push({ name, arguments: arguments_ });
        }
      }
    }

    return decorators;
  }

  private getTextWithType(node: ts.Node, sourceFile: ts.SourceFile): string {
    return node.getText(sourceFile).trim();
  }

  private getAccessModifier(modifiers?: readonly ts.Modifier[]): "public" | "private" | "protected" | "" {
    if (!modifiers) return "";
    if (modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) return "private";
    if (modifiers.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)) return "protected";
    if (modifiers.some(m => m.kind === ts.SyntaxKind.PublicKeyword)) return "public";
    return "";
  }

  private extractNamespace(sourceFile: ts.SourceFile, node: ts.Node): string {
    const moduleDeclaration = this.findAncestor(sourceFile, node, ts.SyntaxKind.ModuleDeclaration);
    if (moduleDeclaration && ts.isModuleDeclaration(moduleDeclaration)) {
      const name = moduleDeclaration.name?.getText(sourceFile);
      return name?.replace(/["']/g, "") || "";
    }
    return "";
  }

  private findAncestor(sourceFile: ts.SourceFile, node: ts.Node, kind: ts.SyntaxKind): ts.Node | undefined {
    let current = node.parent;
    while (current) {
      if (current.kind === kind) return current;
      current = current.parent;
    }
    return undefined;
  }

  private getLineNumbers(node: ts.Node, sourceFile: ts.SourceFile): { startLine: number; endLine: number } {
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    return { startLine, endLine };
  }

  private generateId(name: string, filePath: string): string {
    const pathHash = filePath.split('/').slice(-3, -1).join('_').replace(/[^a-zA-Z0-9]/g, '_');
    return `${pathHash}_${name}`;
  }

  getSourceFileContent(filePath: string): string | null {
    const sourceFile = this.sourceFiles.get(filePath);
    return sourceFile ? sourceFile.getText() : null;
  }

  getFileForClass(classId: string): { content: string; lines: number } | null {
    for (const [path, sourceFile] of this.sourceFiles) {
      const text = sourceFile.getText();
      if (path.includes(classId.split('_')[0])) {
        return {
          content: text,
          lines: sourceFile.getLineStarts().length
        };
      }
    }
    return null;
  }
}
