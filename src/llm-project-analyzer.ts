import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// LLM-based project analysis schemas
export const LLMProjectAnalysisSchema = z.object({
  project_summary: z.string(),
  project_type: z.enum(['rag', 'chatbot', 'agent', 'api', 'embedding', 'multimodal', 'custom', 'unknown']),
  primary_purpose: z.string(),
  frameworks_detected: z.array(z.string()),
  domains_identified: z.array(z.string()),
  security_concerns: z.array(z.string()),
  data_sensitivity_level: z.enum(['low', 'medium', 'high', 'critical']),
  user_interaction_type: z.enum(['direct_user', 'api_only', 'internal_tool', 'production_facing']),
  recommended_benchmarking_options: z.array(z.string()),
  recommended_redteaming_options: z.array(z.string()),
  priority_test_areas: z.array(z.string()),
  confidence_score: z.number().min(0).max(1),
});

export const FileRelevanceSchema = z.object({
  relevant_files: z.array(z.object({
    file_path: z.string().optional(), // Make optional to handle LLM errors
    relevance_score: z.number().min(0).max(1).optional().default(0.5),
    reason: z.string().optional().default('LLM analysis'),
    contains_prompts: z.boolean().optional().default(false),
    contains_ai_logic: z.boolean().optional().default(false),
  })).transform(files => 
    files
      .filter((f): f is { file_path: string; relevance_score: number; reason: string; contains_prompts: boolean; contains_ai_logic: boolean } => 
        !!f.file_path && typeof f.file_path === 'string'
      )
  ), // Filter out files without paths and ensure proper typing
  ignored_patterns: z.array(z.string()).optional().default([]),
  focus_areas: z.array(z.string()).optional().default(['ai_logic', 'prompts', 'integrations']),
});

export type LLMProjectAnalysis = z.infer<typeof LLMProjectAnalysisSchema>;
export type FileRelevance = z.infer<typeof FileRelevanceSchema>;

export interface LLMAnalyzer {
  callLLM(prompt: string): Promise<string>;
}

export class LLMProjectAnalyzer {
  private llmAnalyzer: LLMAnalyzer;

  constructor(llmAnalyzer: LLMAnalyzer) {
    this.llmAnalyzer = llmAnalyzer;
  }

  async analyzeProject(projectPath: string, userIgnoreRules?: string[]): Promise<LLMProjectAnalysis> {
    console.log(`[DEBUG] Starting LLM-based analysis of: ${projectPath}`);
    
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Step 1: Get project structure overview
    const projectStructure = this.getProjectStructure(projectPath);
    
    // Step 2: Identify relevant files using LLM
    const relevantFiles = await this.identifyRelevantFiles(projectPath, projectStructure, userIgnoreRules);
    
    // Step 3: Analyze relevant files for AI/LLM content
    const filesForAnalysis = relevantFiles.relevant_files
      .map(f => ({ file_path: f.file_path, relevance_score: f.relevance_score }));
    
    const fileContents = await this.extractRelevantContent(projectPath, filesForAnalysis);
    
    // Step 4: Perform comprehensive LLM-based project analysis
    const projectAnalysis = await this.performLLMAnalysis(projectPath, projectStructure, fileContents, relevantFiles);
    
    return projectAnalysis;
  }

  private getProjectStructure(projectPath: string, maxDepth: number = 3): string {
    const structure: string[] = [];
    
    const traverse = (currentPath: string, depth: number, prefix: string = '') => {
      if (depth > maxDepth) return;
      
      try {
        const items = fs.readdirSync(currentPath).slice(0, 20); // Limit to 20 items per directory
        
        items.forEach((item, index) => {
          const itemPath = path.join(currentPath, item);
          const isLast = index === items.length - 1;
          const currentPrefix = prefix + (isLast ? '└── ' : '├── ');
          
          try {
            const stats = fs.statSync(itemPath);
            if (stats.isDirectory() && !this.shouldIgnoreDirectory(item)) {
              structure.push(`${currentPrefix}${item}/`);
              const nextPrefix = prefix + (isLast ? '    ' : '│   ');
              traverse(itemPath, depth + 1, nextPrefix);
            } else if (stats.isFile()) {
              const size = stats.size > 1024 ? `${Math.round(stats.size / 1024)}KB` : `${stats.size}B`;
              structure.push(`${currentPrefix}${item} (${size})`);
            }
          } catch (error) {
            // Skip files we can't access
          }
        });
      } catch (error) {
        console.warn(`[WARN] Cannot read directory ${currentPath}`);
      }
    };
    
    traverse(projectPath, 0);
    return structure.join('\n');
  }

  private shouldIgnoreDirectory(dirName: string): boolean {
    const ignorePatterns = [
      'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
      'dist', 'build', '.next', '.nuxt', 'target', 'bin', 'obj',
      '.pytest_cache', '.coverage', '.nyc_output', 'coverage'
    ];
    return ignorePatterns.includes(dirName) || dirName.startsWith('.');
  }

  private async identifyRelevantFiles(
    projectPath: string, 
    projectStructure: string, 
    userIgnoreRules?: string[]
  ): Promise<FileRelevance> {
    const prompt = `Analyze this project structure and identify files relevant for LLM/AI application testing.

Project Structure:
${projectStructure}

${userIgnoreRules ? `User-specified files/patterns to ignore: ${userIgnoreRules.join(', ')}` : ''}

Identify files that are likely to contain:
1. AI/LLM prompts or prompt templates
2. LLM API calls or integrations
3. AI logic, agents, or workflows
4. Configuration files for AI services
5. Data processing for AI models
6. User-facing AI features

Ignore files that are:
- Build artifacts, dependencies, or generated files
- Test files (unless they test AI functionality)
- Documentation that doesn't contain prompts
- Standard web assets (CSS, images, etc.)
- Files matching user ignore patterns

Return a JSON object with:
- relevant_files: Array of files with relevance_score (0-1), reason, and booleans for contains_prompts/contains_ai_logic
- ignored_patterns: Patterns that were ignored
- focus_areas: Key areas to focus analysis on

Be selective - only include files that are clearly relevant to AI/LLM functionality.`;

    try {
      const response = await this.llmAnalyzer.callLLM(prompt);
      const cleanedResponse = this.cleanJsonResponse(response);
      
      console.log(`[DEBUG] LLM file relevance raw response:`, response);
      console.log(`[DEBUG] Cleaned JSON response:`, cleanedResponse);
      
      const parsed = JSON.parse(cleanedResponse);
      console.log(`[DEBUG] Parsed JSON structure:`, JSON.stringify(parsed, null, 2));
      
      const validated = FileRelevanceSchema.parse(parsed);
      console.log(`[DEBUG] Successfully validated ${validated.relevant_files.length} relevant files`);
      
      return validated;
    } catch (error) {
      console.error(`[ERROR] LLM file relevance analysis failed:`, error);
      console.log(`[DEBUG] Falling back to heuristic file identification`);
      // Fallback to simple heuristic
      return this.fallbackFileIdentification(projectPath, userIgnoreRules);
    }
  }

  private fallbackFileIdentification(projectPath: string, userIgnoreRules?: string[]): FileRelevance {
    const relevantFiles: Array<{
      file_path: string;
      relevance_score: number;
      reason: string;
      contains_prompts: boolean;
      contains_ai_logic: boolean;
    }> = [];
    const aiExtensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.ipynb'];
    
    const searchFiles = (dir: string, depth: number = 0) => {
      if (depth > 3) return;
      
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativePath = path.relative(projectPath, fullPath);
          
          // Skip if matches user ignore rules
          if (userIgnoreRules?.some(pattern => relativePath.includes(pattern))) continue;
          
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory() && !this.shouldIgnoreDirectory(item)) {
            searchFiles(fullPath, depth + 1);
          } else if (stats.isFile() && aiExtensions.includes(path.extname(item))) {
            relevantFiles.push({
              file_path: relativePath,
              relevance_score: 0.7,
              reason: `AI-related file extension: ${path.extname(item)}`,
              contains_prompts: false,
              contains_ai_logic: true,
            });
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    searchFiles(projectPath);
    
    return {
      relevant_files: relevantFiles.slice(0, 20), // Limit to top 20
      ignored_patterns: userIgnoreRules || [],
      focus_areas: ['ai_logic', 'prompts', 'integrations'],
    };
  }

  private async extractRelevantContent(
    projectPath: string, 
    relevantFiles: Array<{file_path: string; relevance_score: number}>
  ): Promise<string> {
    const contents: string[] = [];
    
    // Sort by relevance and take top 10 files
    const topFiles = relevantFiles
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 10);
    
    for (const fileInfo of topFiles) {
      try {
        const fullPath = path.join(projectPath, fileInfo.file_path);
        const stats = fs.statSync(fullPath);
        
        // Skip very large files
        if (stats.size > 100 * 1024) { // 100KB limit
          contents.push(`\n=== ${fileInfo.file_path} ===\n[File too large, skipped - ${Math.round(stats.size / 1024)}KB]`);
          continue;
        }
        
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Truncate very long content
        const truncatedContent = content.length > 2000 ? content.substring(0, 2000) + '\n... [truncated]' : content;
        
        contents.push(`\n=== ${fileInfo.file_path} ===\n${truncatedContent}`);
      } catch (error) {
        console.warn(`[WARN] Cannot read file ${fileInfo.file_path}: ${error}`);
      }
    }
    
    return contents.join('\n');
  }

  private async performLLMAnalysis(
    projectPath: string,
    projectStructure: string,
    fileContents: string,
    relevantFiles: FileRelevance
  ): Promise<LLMProjectAnalysis> {
    // Get actual available cookbooks, recipes, datasets, and attack modules dynamically
    const availableCookbooks = await this.getAvailableCookbooks();
    const availableRecipes = await this.getAvailableRecipes();
    const availableDatasets = await this.getAvailableDatasets();
    const availableAttackModules = await this.getAvailableAttackModules();
    
    const cookbooksList = availableCookbooks.map(name => `- ${name}: Benchmarking cookbook`).join('\n');
    const recipesList = availableRecipes.map(name => `- ${name}: Benchmarking recipe`).join('\n');
    const datasetsList = availableDatasets.map(name => `- ${name}: Benchmarking dataset`).join('\n');
    const attackModulesList = availableAttackModules.map(name => `- ${name}: Red teaming attack module`).join('\n');
    
    const prompt = `Analyze this LLM/AI project and recommend appropriate Moonshot tests.

Project Path: ${projectPath}

Project Structure Overview:
${projectStructure.substring(0, 1000)}${projectStructure.length > 1000 ? '... [truncated]' : ''}

Relevant File Contents:
${fileContents}

Available Benchmarking Resources (ONLY use names from these lists):

COOKBOOKS (from revised-moonshot-data/cookbooks):
${cookbooksList}

RECIPES (from revised-moonshot-data/recipes):
${recipesList}

DATASETS (from revised-moonshot-data/datasets):
${datasetsList}

Available Red Teaming Attack Modules (ONLY use names from this list):

ATTACK MODULES (from revised-moonshot-data/attack-modules):
${attackModulesList}

CRITICAL CONSTRAINTS:
- For recommended_benchmarking_options: ONLY use exact names from the COOKBOOKS, RECIPES, or DATASETS lists above
- For recommended_redteaming_options: ONLY use exact names from the ATTACK MODULES list above
- Do NOT recommend any names that are not in these specific lists
- Do NOT make up or invent test names

Based on your analysis, provide a JSON response with:
1. project_summary: Brief description of what this project does
2. project_type: Main type (rag, chatbot, agent, api, embedding, multimodal, custom, unknown)
3. primary_purpose: Main purpose/use case
4. frameworks_detected: AI/LLM frameworks found (langchain, openai, anthropic, etc.)
5. domains_identified: Application domains (healthcare, finance, education, etc.)
6. security_concerns: Potential security risks identified
7. data_sensitivity_level: Level of data sensitivity (low, medium, high, critical)
8. user_interaction_type: How users interact (direct_user, api_only, internal_tool, production_facing)
9. recommended_benchmarking_options: Specific names from COOKBOOKS, RECIPES, or DATASETS lists only
10. recommended_redteaming_options: Specific names from ATTACK MODULES list only
11. priority_test_areas: Key areas to focus testing on (bias, toxicity, hallucination, security, etc.)
12. confidence_score: Your confidence in this analysis (0-1)

Be specific and actionable. Focus on tests that are most relevant to this particular project's characteristics and risks.`;

    try {
      const response = await this.llmAnalyzer.callLLM(prompt);
      console.log(`[DEBUG] LLM project analysis raw response:`, response);
      const cleanedResponse = this.cleanJsonResponse(response);
      console.log(`[DEBUG] LLM project analysis cleaned response:`, cleanedResponse);
      const parsed = JSON.parse(cleanedResponse);
      return LLMProjectAnalysisSchema.parse(parsed);
    } catch (error) {
      console.error(`[ERROR] Try again - LLM project analysis failed:`, error);
      throw new Error(`Project analysis failed. Please try running analyze_project again. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async getAvailableCookbooks(): Promise<string[]> {
    try {
      const baseDataPath = path.resolve(process.cwd(), '../revised-moonshot-data');
      const cookbooksDir = path.join(baseDataPath, 'cookbooks');
      const files = await fs.promises.readdir(cookbooksDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .sort();
    } catch (error) {
      console.error('Error reading cookbooks directory:', error);
      return [];
    }
  }

  public async getAvailableRecipes(): Promise<string[]> {
    try {
      const baseDataPath = path.resolve(process.cwd(), '../revised-moonshot-data');
      const recipesDir = path.join(baseDataPath, 'recipes');
      const files = await fs.promises.readdir(recipesDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .sort();
    } catch (error) {
      console.error('Error reading recipes directory:', error);
      return [];
    }
  }

  public async getAvailableDatasets(): Promise<string[]> {
    try {
      const baseDataPath = path.resolve(process.cwd(), '../revised-moonshot-data');
      const datasetsDir = path.join(baseDataPath, 'datasets');
      const files = await fs.promises.readdir(datasetsDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .sort();
    } catch (error) {
      console.error('Error reading datasets directory:', error);
      return [];
    }
  }

  public async getAvailableAttackModules(): Promise<string[]> {
    try {
      const baseDataPath = path.resolve(process.cwd(), '../revised-moonshot-data');
      const attackModulesDir = path.join(baseDataPath, 'attack-modules');
      const files = await fs.promises.readdir(attackModulesDir);
      return files
        .filter(file => file.endsWith('.py'))
        .map(file => file.replace('.py', ''))
        .filter(name => name !== '__pycache__' && name !== 'cache')
        .sort();
    } catch (error) {
      console.error('Error reading attack-modules directory:', error);
      return [];
    }
  }

  private cleanJsonResponse(response: string): string {
    return response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^[\s\n]*{/, '{')
      .replace(/}[\s\n]*$/, '}')
      .trim();
  }


  // Generate a human-readable analysis summary
  generateAnalysisSummary(analysis: LLMProjectAnalysis): string {
    const summary = [];
    
    summary.push(`# LLM Project Analysis Summary\n`);
    summary.push(`**Project Type:** ${analysis.project_type.toUpperCase()}`);
    summary.push(`**Primary Purpose:** ${analysis.primary_purpose}`);
    summary.push(`**Confidence:** ${(analysis.confidence_score * 100).toFixed(0)}%\n`);
    
    summary.push(`## Overview`);
    summary.push(analysis.project_summary + '\n');
    
    if (analysis.frameworks_detected.length > 0) {
      summary.push(`## Detected Frameworks`);
      analysis.frameworks_detected.forEach(framework => {
        summary.push(`- ${framework}`);
      });
      summary.push('');
    }
    
    if (analysis.domains_identified.length > 0) {
      summary.push(`## Identified Domains`);
      analysis.domains_identified.forEach(domain => {
        summary.push(`- ${domain}`);
      });
      summary.push('');
    }
    
    if (analysis.security_concerns.length > 0) {
      summary.push(`## Security Concerns`);
      analysis.security_concerns.forEach(concern => {
        summary.push(`- ${concern}`);
      });
      summary.push('');
    }
    
    summary.push(`## Recommended Benchmarking Cookbooks`);
    analysis.recommended_benchmarking_options.forEach((cookbook: string) => {
      summary.push(`- ${cookbook}`);
    });
    summary.push('');
    
    summary.push(`## Recommended Red Teaming Modules`);
    analysis.recommended_redteaming_options.forEach((module: string) => {
      summary.push(`- ${module}`);
    });
    summary.push('');
    
    summary.push(`## Priority Test Areas`);
    analysis.priority_test_areas.forEach(area => {
      summary.push(`- ${area}`);
    });
    
    summary.push(`\n**Data Sensitivity:** ${analysis.data_sensitivity_level}`);
    summary.push(`**User Interaction:** ${analysis.user_interaction_type}`);
    
    return summary.join('\n');
  }
}