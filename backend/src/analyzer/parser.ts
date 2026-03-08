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
  private fileImports: Map<string, string[]> = new Map();
  private scanPath: string = "";

  async parseDirectory(dirPath: string, options?: {
    exclude?: string[];
    include?: string[];
  }): Promise<void> {
    this.scanPath = Deno.realPathSync(dirPath);
    this.sourceFiles.clear();
    this.fileImports.clear();

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

    const scanDir = this.scanPath.replace(/\\/g, '/');
    this.program.getSourceFiles().forEach(sf => {
      const sfPath = sf.fileName.replace(/\\/g, '/');
      if (sfPath.startsWith(scanDir)) {
        this.sourceFiles.set(sf.fileName, sf);
        this.fileImports.set(sf.fileName, this.extractImportsFromSourceFile(sf));
      }
    });
  }

  private async findFiles(dirPath: string, includes: string[], excludes: string[]): Promise<string[]> {
    const files: string[] = [];
    const scanRoot = Deno.realPathSync(dirPath).replace(/\\/g, '/');
    const normalizedIncludes = includes.map(p =>
      p.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '')
    );
    const normalizedExcludes = excludes.map(p => p.replace(/\\/g, '/'));

    const globToRegExp = (glob: string): RegExp => {
      const hasGlobMeta = /[*?]/.test(glob);
      const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const isDirectoryOnlyPattern = glob.endsWith('/');

      if (!hasGlobMeta) {
        const exact = escaped.endsWith('/') ? escaped.slice(0, -1) : escaped;
        return new RegExp(`(?:^|/)${exact}(?:/.*)?$`);
      }

      const segments = glob.split('/').filter(segment => segment.length > 0);
      const segmentToRegex = (segment: string): string => {
        const escapedSegment = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        return escapedSegment
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]');
      };

      const regexSource = '^' + segments.map((segment, index) => {
        if (segment === '**') return '(?:[^/]+/)*';
        const current = segmentToRegex(segment);
        return index === segments.length - 1 ? current : `${current}/`;
      }).join('') + (isDirectoryOnlyPattern ? '.*$' : '$');

      return new RegExp(regexSource);
    };

    const includeMatchers = normalizedIncludes.map((pattern) => {
      const regex = globToRegExp(pattern);
      return { pattern, regex };
    });

    const shouldInclude = (path: string): boolean => {
      const normalizedPath = path.replace(/\\/g, '/');
      const isSourceExt = /\.(ts|tsx|js|jsx)$/.test(normalizedPath);
      const isExcluded = normalizedExcludes.some(exc => normalizedPath.includes(exc));
      if (!isSourceExt || isExcluded) {
        return false;
      }

      const relativePath = normalizedPath.startsWith(scanRoot)
        ? normalizedPath.slice(scanRoot.length).replace(/^\/+/, '')
        : normalizedPath;

      return includeMatchers.some(({ regex }) => regex.test(relativePath));
    };

    const walkDir = async (dir: string) => {
      try {
        for await (const entry of Deno.readDir(dir)) {
          const fullPath = `${dir}/${entry.name}`;
          const normalizedFullPath = fullPath.replace(/\\/g, '/');

          if (isSymlink(fullPath)) {
            continue;
          }

          if (entry.isDirectory) {
            if (!normalizedExcludes.some(exc => normalizedFullPath.includes(exc))) {
              await walkDir(fullPath);
            }
          } else if (entry.isFile && shouldInclude(fullPath)) {
            files.push(fullPath);
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

      if (
        sfPath.includes('/node_modules/') ||
        sfPath.includes('/.cache/') ||
        sfPath.includes('/deno/') ||
        sfPath.includes('lib.es5') ||
        sfPath.includes('lib.dom')
      ) {
        continue;
      }

      if (!sfPath.startsWith(scanDir)) {
        continue;
      }

      const imports = this.fileImports.get(sourceFile.fileName) || [];

      ts.forEachChild(sourceFile, node => {
        if (ts.isClassDeclaration(node)) {
          const classInfo = this.extractClassInfo(node, sourceFile, imports);
          if (classInfo) {
            classes.push(classInfo);
          }
        } else if (ts.isInterfaceDeclaration(node)) {
          const classInfo = this.extractInterfaceInfo(node, sourceFile, imports);
          if (classInfo) {
            classes.push(classInfo);
          }
        } else if (ts.isEnumDeclaration(node)) {
          const enumInfo = this.extractEnumInfo(node, sourceFile, imports);
          if (enumInfo) {
            classes.push(enumInfo);
          }
        } else if (ts.isTypeAliasDeclaration(node)) {
          const aliasInfo = this.extractTypeAliasInfo(node, sourceFile, imports);
          if (aliasInfo) {
            classes.push(aliasInfo);
          }
        } else if (ts.isFunctionDeclaration(node)) {
          const fnInfo = this.extractFunctionInfo(node, sourceFile, imports);
          if (fnInfo) {
            classes.push(fnInfo);
          }
        }
      });
    }

    return classes;
  }

  private extractClassInfo(node: ts.ClassDeclaration, sourceFile: ts.SourceFile, imports: string[]): ClassInfo | null {
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
    const isAbstractByName = /^(?:Base|Abstract)(?=[A-Z])/.test(name);
    const isAbstract = hasAbstractKeyword || isAbstractByName;

    const methods = this.extractMethods(node, sourceFile);
    const properties = this.extractProperties(node, sourceFile);
    const decorators = this.extractDecorators(node, sourceFile);
    const references = this.collectReferencesFromMembers(methods, properties);

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
      imports,
      references,
      startLine,
      endLine
    };
  }

  private extractInterfaceInfo(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile, imports: string[]): ClassInfo | null {
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

    const references = this.collectReferencesFromMembers(methods, properties);

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
      imports,
      references,
      startLine,
      endLine
    };
  }

  private extractEnumInfo(node: ts.EnumDeclaration, sourceFile: ts.SourceFile, imports: string[]): ClassInfo | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const id = this.generateId(name, sourceFile.fileName);
    const namespace = this.extractNamespace(sourceFile, node);
    const filePath = sourceFile.fileName;

    const properties: PropertyInfo[] = node.members.map(member => {
      const propName = member.name.getText(sourceFile);
      const propType = member.initializer ? member.initializer.getText(sourceFile) : "auto";
      return {
        name: propName,
        type: propType,
        accessModifier: "",
        isStatic: false,
        isReadonly: true,
        decorators: []
      };
    });

    const { startLine, endLine } = this.getLineNumbers(node, sourceFile);

    return {
      id,
      name,
      namespace,
      filePath,
      type: "enum",
      methods: [],
      properties,
      decorators: this.extractDecorators(node, sourceFile),
      extends: undefined,
      implements: [],
      imports,
      references: [],
      signature: `enum ${name}`,
      startLine,
      endLine
    };
  }

  private extractTypeAliasInfo(node: ts.TypeAliasDeclaration, sourceFile: ts.SourceFile, imports: string[]): ClassInfo | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const id = this.generateId(name, sourceFile.fileName);
    const namespace = this.extractNamespace(sourceFile, node);
    const filePath = sourceFile.fileName;
    const aliasType = node.type ? this.getTextWithType(node.type, sourceFile) : "any";

    const { startLine, endLine } = this.getLineNumbers(node, sourceFile);

    return {
      id,
      name,
      namespace,
      filePath,
      type: "typeAlias",
      methods: [],
      properties: [{
        name: "target",
        type: aliasType,
        accessModifier: "",
        isStatic: false,
        isReadonly: true,
        decorators: []
      }],
      decorators: this.extractDecorators(node, sourceFile),
      extends: undefined,
      implements: [],
      imports,
      references: this.collectReferencesFromType(aliasType),
      signature: `${name} = ${aliasType}`,
      startLine,
      endLine
    };
  }

  private extractFunctionInfo(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile, imports: string[]): ClassInfo | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const id = this.generateId(name, sourceFile.fileName);
    const namespace = this.extractNamespace(sourceFile, node);
    const filePath = sourceFile.fileName;

    const parameters = this.extractParameterInfo(node.parameters, sourceFile);
    const returnType = node.type ? this.getTextWithType(node.type, sourceFile) : "any";
    const signature = `${name}(${parameters.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')}) => ${returnType}`;

    const methods: MethodInfo[] = [{
      name,
      parameters,
      returnType,
      accessModifier: "",
      isStatic: false,
      isAbstract: false,
      decorators: this.extractDecorators(node, sourceFile)
    }];

    const references = this.collectReferencesFromType(returnType)
      .concat(parameters.flatMap(param => this.collectReferencesFromType(param.type)));

    const { startLine, endLine } = this.getLineNumbers(node, sourceFile);

    return {
      id,
      name,
      namespace,
      filePath,
      type: "function",
      methods,
      properties: [],
      decorators: this.extractDecorators(node, sourceFile),
      extends: undefined,
      implements: [],
      imports,
      references: this.unique(references),
      signature,
      startLine,
      endLine
    };
  }

  private extractImportsFromSourceFile(sourceFile: ts.SourceFile): string[] {
    const imports = new Set<string>();

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }

      const clause = statement.importClause;
      if (!clause) continue;

      if (clause.name) {
        imports.add(clause.name.getText(sourceFile));
      }

      const namedBindings = clause.namedBindings;
      if (!namedBindings) continue;

      if (ts.isNamedImports(namedBindings)) {
        for (const binding of namedBindings.elements) {
          imports.add(binding.name.getText(sourceFile));
          if (binding.propertyName) {
            imports.add(binding.propertyName.getText(sourceFile));
          }
        }
      } else if (ts.isNamespaceImport(namedBindings)) {
        imports.add(namedBindings.name.getText(sourceFile));
      }
    }

    return Array.from(imports);
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

  private extractDecorators(node: ts.Node, sourceFile: ts.SourceFile): DecoratorInfo[] {
    const decorators: DecoratorInfo[] = [];
    if (!ts.canHaveDecorators(node)) return decorators;

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

  private collectReferencesFromMembers(methods: MethodInfo[], properties: PropertyInfo[]): string[] {
    const names = [
      ...methods.flatMap(method => [
        ...this.collectReferencesFromType(method.returnType),
        ...method.parameters.flatMap(p => this.collectReferencesFromType(p.type))
      ]),
      ...properties.flatMap(property => this.collectReferencesFromType(property.type))
    ];
    return this.unique(names);
  }

  private collectReferencesFromType(typeText: string): string[] {
    const candidates = typeText.match(/[A-Za-z_$][A-Za-z0-9_$\.]*[A-Za-z0-9_$]/g) || [];
    const names = candidates
      .map(candidate => candidate.split('.').pop() || candidate)
      .filter(name => {
        if (!/^[A-Z]/.test(name)) return false;
        if (this.isBuiltInTypeName(name)) return false;
        return name.length > 1;
      });
    return this.unique(names);
  }

  private isBuiltInTypeName(name: string): boolean {
    const builtins = new Set([
      "Promise", "Array", "Map", "Set", "WeakMap", "WeakSet", "Record", "Readonly", "Pick",
      "ReturnType", "Parameters", "ConstructorParameters", "Omit", "Partial", "Required", "ReadonlyArray",
      "String", "Number", "Boolean", "Object", "Date", "RegExp", "Error", "ErrorEvent", "Event"
    ]);

    return builtins.has(name);
  }

  private unique(items: string[]): string[] {
    return [...new Set(items.map(item => item.trim()).filter(Boolean))];
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
