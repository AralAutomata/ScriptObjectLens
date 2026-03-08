import { SchemaModel, SchemaField, SchemaRelation } from "../../../shared/types.ts";

const SKIP_DIRS = ["node_modules", ".next", ".git", "dist", "build", ".cache"];

function isSymlink(path: string): boolean {
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

interface ParsedPrismaModel {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    attributes: string[];
  }>;
}

function parsePrismaSchema(content: string): ParsedPrismaModel[] {
  const models: ParsedPrismaModel[] = [];
  
  // Match model blocks
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;
  
  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const fieldsBlock = match[2];
    
    const fields: Array<{ name: string; type: string; attributes: string[] }> = [];
    const fieldLines = fieldsBlock.split('\n');
    
    for (const line of fieldLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      // Parse field: name Type @attribute @attribute
      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)(.*)$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        const attributesStr = fieldMatch[3].trim();
        const attributes = attributesStr ? attributesStr.split(/\s+@/).filter(Boolean) : [];
        
        fields.push({
          name: fieldName,
          type: fieldType,
          attributes: attributes.map((a) => '@' + a),
        });
      }
    }
    
    models.push({ name: modelName, fields });
  }
  
  return models;
}

function extractPrismaRelations(models: ParsedPrismaModel[]): SchemaRelation[] {
  const relations: SchemaRelation[] = [];
  
  for (const model of models) {
    for (const field of model.fields) {
      // Check if field has @relation attribute
      const relationAttr = field.attributes.find((a) => a.startsWith('@relation'));
      if (relationAttr) {
        // Extract referenced model from type
        const isArray = field.type.endsWith('[]');
        const targetModel = field.type.replace(/\[\]$/, '');
        
        // Try to extract fields from @relation
        const fieldsMatch = relationAttr.match(/fields:\s*\[(\w+)\]/);
        const referencesMatch = relationAttr.match(/references:\s*\[(\w+)\]/);
        
        const sourceField = fieldsMatch ? fieldsMatch[1] : field.name;
        const targetField = referencesMatch ? referencesMatch[1] : 'id';
        
        relations.push({
          source: model.name,
          target: targetModel,
          sourceField,
          targetField,
          type: isArray ? 'one-to-many' : 'many-to-one',
        });
      }
    }
  }
  
  return relations;
}

function parseDrizzleSchema(content: string): { models: ParsedPrismaModel[]; relations: SchemaRelation[] } {
  const models: ParsedPrismaModel[] = [];
  const relations: SchemaRelation[] = [];
  
  // Match pgTable/mysqlTable/sqliteTable calls with proper brace matching
  const tableRegex = /(?:export\s+const\s+)?(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`](\w+)['"`]\s*,\s*\{/g;
  let match;
  
  while ((match = tableRegex.exec(content)) !== null) {
    const modelName = match[1];
    const tableName = match[2];
    
    // Extract columns block with proper brace matching
    const startIdx = match.index + match[0].length - 1; // Position of opening brace
    let braceCount = 1;
    let endIdx = startIdx + 1;
    
    while (braceCount > 0 && endIdx < content.length) {
      if (content[endIdx] === '{') braceCount++;
      if (content[endIdx] === '}') braceCount--;
      endIdx++;
    }
    
    const columnsBlock = content.substring(startIdx + 1, endIdx - 1);
    
    const fields: Array<{ name: string; type: string; attributes: string[] }> = [];
    
    // Parse columns using line-by-line approach
    const lines = columnsBlock.split('\n');
    let currentColumn: { name: string; def: string } | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      // Check if this line starts a new column definition
      const colStartMatch = trimmed.match(/^(\w+):\s*(.+)$/);
      
      if (colStartMatch && !currentColumn) {
        // Start of a new column
        currentColumn = {
          name: colStartMatch[1],
          def: colStartMatch[2]
        };
      } else if (currentColumn) {
        // Continuation of current column definition
        currentColumn.def += ' ' + trimmed;
      }
      
      // Check if current column definition is complete (ends with comma or is the last one)
      if (currentColumn && (trimmed.endsWith(',') || trimmed === lines[lines.length - 1].trim())) {
        // Remove trailing comma
        currentColumn.def = currentColumn.def.replace(/,$/, '');
        
        // Parse the column definition
        // Pattern: type('name').modifiers() or type('name', { config }).modifiers()
        const typeMatch = currentColumn.def.match(/^(\w+)\(/);
        if (typeMatch) {
          const colType = typeMatch[1];
          const def = currentColumn.def;
          
          const attributes: string[] = [];
          if (def.includes('primaryKey()') || colType === 'serial') {
            attributes.push('@id');
          }
          if (def.includes('unique()') || def.includes('uniqueIndex')) {
            attributes.push('@unique');
          }
          if (def.includes('notNull()')) {
            attributes.push('@notNull');
          }
          if (def.includes('references(')) {
            attributes.push('@relation');
          }
          
          fields.push({
            name: currentColumn.name,
            type: colType,
            attributes,
          });
        }
        
        currentColumn = null;
      }
    }
    
    models.push({ name: modelName, fields });
  }
  
  // Try to find relations in drizzle relations export
  // Look for references in table definitions first (more reliable)
  for (const model of models) {
    const modelRegex = new RegExp(`export\\s+const\\s+${model.name}\\s*=\\s*(?:pgTable|mysqlTable|sqliteTable)\\s*\\(\\s*['"\`]\\w+['"\`]\\s*,\\s*\\{`, 'g');
    let modelMatch;
    while ((modelMatch = modelRegex.exec(content)) !== null) {
      const startIdx = modelMatch.index + modelMatch[0].length - 1;
      let braceCount = 1;
      let endIdx = startIdx + 1;
      while (braceCount > 0 && endIdx < content.length) {
        if (content[endIdx] === '{') braceCount++;
        if (content[endIdx] === '}') braceCount--;
        endIdx++;
      }
      const modelBlock = content.substring(startIdx + 1, endIdx - 1);
      
      // Find references in this model - look for field: type().references(() => TargetModel.id)
      const refRegex = /(\w+):\s*[^,\n]+\.references\(\s*\(\)\s*=>\s*(\w+)\./g;
      let refMatch;
      while ((refMatch = refRegex.exec(modelBlock)) !== null) {
        const fieldName = refMatch[1];
        const targetModel = refMatch[2];
        relations.push({
          source: model.name,
          target: targetModel,
          sourceField: fieldName,
          targetField: 'id',
          type: 'many-to-one',
        });
      }
    }
  }
  
  // Also try to extract from explicit relations() calls
  const relationsRegex = /export\s+const\s+(\w+)Relations\s*=\s*relations\s*\(\s*(\w+)\s*,\s*\(/g;
  while ((match = relationsRegex.exec(content)) !== null) {
    const sourceModel = match[2];
    
    // Extract the relations config block with proper parenthesis matching
    const startIdx = match.index + match[0].length - 1;
    let parenCount = 1;
    let endIdx = startIdx + 1;
    while (parenCount > 0 && endIdx < content.length) {
      if (content[endIdx] === '(') parenCount++;
      if (content[endIdx] === ')') parenCount--;
      endIdx++;
    }
    
    const relationsBlock = content.substring(startIdx + 1, endIdx - 1);
    
    // Parse one/many relations
    const relationMatches = relationsBlock.matchAll(/(\w+):\s*(one|many)\s*\(\s*(\w+)/g);
    for (const relMatch of relationMatches) {
      const relField = relMatch[1];
      const relType = relMatch[2]; // one, many
      const targetModel = relMatch[3];
      
      // Look for fields/references in the relation config
      const configMatch = relationsBlock.substring(relMatch.index).match(/\{[^}]*fields:\s*\[(\w+)\][^}]*references:\s*\[(\w+)\]/);
      const sourceField = configMatch ? configMatch[1] : `${targetModel.toLowerCase()}Id`;
      const targetField = configMatch ? configMatch[2] : 'id';
      
      relations.push({
        source: sourceModel,
        target: targetModel,
        sourceField,
        targetField,
        type: relType === 'many' ? 'one-to-many' : 'many-to-one',
      });
    }
  }
  
  return { models, relations };
}

export async function analyzeDatabaseSchema(dirPath: string): Promise<{ models: SchemaModel[]; relations: SchemaRelation[]; type: 'prisma' | 'drizzle' }> {
  let schemaType: 'prisma' | 'drizzle' | null = null;
  let schemaContent = '';
  
  // Find schema.prisma
  const possiblePrismaPaths = [
    `${dirPath}/prisma/schema.prisma`,
    `${dirPath}/schema.prisma`,
    `${dirPath}/prisma/schema`,
  ];
  
  for (const path of possiblePrismaPaths) {
    try {
      schemaContent = Deno.readTextFileSync(path);
      schemaType = 'prisma';
      break;
    } catch {
      // Try next path
    }
  }
  
  // If no Prisma, look for Drizzle files
  if (!schemaType) {
    const drizzleFiles: string[] = [];
    
    async function findDrizzleFiles(dir: string) {
      try {
        for await (const entry of Deno.readDir(dir)) {
          const fullPath = `${dir}/${entry.name}`;
          
          if (isSymlink(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory) {
            // Skip backend analyzer directory to avoid picking up the analyzer code itself
            if (entry.name === 'analyzer' && fullPath.includes('backend')) {
              continue;
            }
            if (!SKIP_DIRS.includes(entry.name) && !entry.name.includes('test') && !entry.name.includes('spec')) {
              await findDrizzleFiles(fullPath);
            }
          } else if (entry.isFile) {
            const name = entry.name.toLowerCase();
            // Look for schema.ts files in drizzle directories or files with pgTable/mysqlTable/sqliteTable
            if ((name.includes('schema') || name.includes('db')) && (name.endsWith('.ts') || name.endsWith('.js'))) {
              try {
                const content = Deno.readTextFileSync(fullPath);
                // Check for actual table definitions, not just mentions of pgTable in comments/code
                if (/export\s+const\s+\w+\s*=\s*(?:pgTable|mysqlTable|sqliteTable)/.test(content)) {
                  drizzleFiles.push(fullPath);
                }
              } catch {
                // Skip files we can't read
              }
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
    
    await findDrizzleFiles(dirPath);
    
    if (drizzleFiles.length > 0) {
      // Read first drizzle schema file
      try {
        schemaContent = Deno.readTextFileSync(drizzleFiles[0]);
        schemaType = 'drizzle';
      } catch {
        // Ignore read errors
      }
    }
  }
  
  if (!schemaType) {
    return { models: [], relations: [], type: 'prisma' };
  }
  
  if (schemaType === 'prisma') {
    const parsedModels = parsePrismaSchema(schemaContent);
    const relations = extractPrismaRelations(parsedModels);
    
    const models: SchemaModel[] = parsedModels.map((m) => ({
      id: m.name,
      name: m.name,
      fields: m.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isId: f.attributes.some((a) => a.includes('@id')),
        isOptional: f.type.endsWith('?'),
        isUnique: f.attributes.some((a) => a.includes('@unique')),
        isRelation: f.attributes.some((a) => a.includes('@relation')),
        defaultValue: f.attributes.find((a) => a.includes('@default')),
      })),
    }));
    
    return { models, relations, type: 'prisma' };
  } else {
    const { models: parsedModels, relations } = parseDrizzleSchema(schemaContent);
    
    const models: SchemaModel[] = parsedModels.map((m) => ({
      id: m.name,
      name: m.name,
      fields: m.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isId: f.attributes.includes('@id'),
        isOptional: !f.attributes.includes('@notNull'),
        isUnique: f.attributes.includes('@unique'),
        isRelation: false, // Drizzle relations are separate
      })),
    }));
    
    return { models, relations, type: 'drizzle' };
  }
}