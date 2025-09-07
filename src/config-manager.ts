import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import os from 'os';

// Project configuration schema
const EndpointConfigSchema = z.object({
  name: z.string(),
  type: z.string(),
  uri: z.string().optional(),
  token: z.string().optional(),
  max_concurrency: z.number().optional(),
  max_calls_per_second: z.number().optional(),
  params: z.record(z.any()).optional(),
});

const ProjectConfigSchema = z.object({
  project_name: z.string(),
  description: z.string().optional(),
  endpoints: z.array(EndpointConfigSchema),
  default_tests: z.array(z.string()).optional(),
  default_metrics: z.array(z.string()).optional(),
  test_parameters: z.object({
    num_workers: z.number().optional(),
    timeout: z.number().optional(),
    random_seed: z.number().optional(),
  }).optional(),
  moonshot_data_path: z.string().optional(),
  output_directory: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export class ConfigManager {
  private configDir: string;
  private defaultConfig: ProjectConfig | null = null;
  private projectConfigs: Map<string, ProjectConfig> = new Map();

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), '.moonshot-mcp', 'configs');
    this.ensureConfigDir();
  }

  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create config directory:', error);
    }
  }

  async loadProject(projectNameOrPath: string): Promise<ProjectConfig> {
    // Check if it's already loaded
    if (this.projectConfigs.has(projectNameOrPath)) {
      return this.projectConfigs.get(projectNameOrPath)!;
    }

    // Check if it's a file path
    let configPath: string;
    if (projectNameOrPath.endsWith('.json')) {
      configPath = projectNameOrPath;
    } else {
      configPath = path.join(this.configDir, `${projectNameOrPath}.json`);
    }

    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = ProjectConfigSchema.parse(JSON.parse(configData));
      this.projectConfigs.set(config.project_name, config);
      return config;
    } catch (error) {
      throw new Error(`Failed to load project config: ${error}`);
    }
  }

  async saveProject(config: ProjectConfig): Promise<void> {
    const configPath = path.join(this.configDir, `${config.project_name}.json`);
    
    try {
      await fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
      this.projectConfigs.set(config.project_name, config);
    } catch (error) {
      throw new Error(`Failed to save project config: ${error}`);
    }
  }

  async createProject(params: {
    project_name: string;
    description?: string;
    endpoints?: any[];
    default_tests?: string[];
  }): Promise<ProjectConfig> {
    const now = new Date().toISOString();
    
    // Convert endpoint configurations
    const endpoints: EndpointConfig[] = params.endpoints?.map(ep => {
      if (typeof ep === 'string') {
        // Simple endpoint name, will use default config
        return {
          name: ep,
          type: this.inferEndpointType(ep),
        };
      }
      return EndpointConfigSchema.parse(ep);
    }) || [];

    const config: ProjectConfig = {
      project_name: params.project_name,
      description: params.description,
      endpoints,
      default_tests: params.default_tests,
      created_at: now,
      updated_at: now,
    };

    await this.saveProject(config);
    return config;
  }

  private inferEndpointType(name: string): string {
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes('openai') || nameLower.includes('gpt')) {
      return 'openai-connector';
    } else if (nameLower.includes('anthropic') || nameLower.includes('claude')) {
      return 'anthropic-connector';
    } else if (nameLower.includes('bedrock')) {
      return 'amazon-bedrock-connector';
    } else if (nameLower.includes('azure')) {
      return 'azure-openai-connector';
    } else if (nameLower.includes('gemini')) {
      return 'google-gemini-connector';
    } else if (nameLower.includes('huggingface')) {
      return 'huggingface-connector';
    } else if (nameLower.includes('together')) {
      return 'together-connector';
    } else if (nameLower.includes('ollama')) {
      return 'ollama-connector';
    }
    
    return 'custom-connector';
  }

  async updateProject(projectName: string, updates: Partial<ProjectConfig>): Promise<ProjectConfig> {
    const existing = await this.loadProject(projectName);
    
    const updated: ProjectConfig = {
      ...existing,
      ...updates,
      project_name: existing.project_name, // Don't allow changing name
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    await this.saveProject(updated);
    return updated;
  }

  async deleteProject(projectName: string): Promise<void> {
    const configPath = path.join(this.configDir, `${projectName}.json`);
    
    try {
      await fs.unlink(configPath);
      this.projectConfigs.delete(projectName);
    } catch (error) {
      throw new Error(`Failed to delete project: ${error}`);
    }
  }

  async listProjects(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.configDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }

  async getDefaultConfig(): Promise<ProjectConfig> {
    if (this.defaultConfig) {
      return this.defaultConfig;
    }

    // Try to load default config
    try {
      this.defaultConfig = await this.loadProject('default');
      return this.defaultConfig;
    } catch {
      // Create a basic default config
      const now = new Date().toISOString();
      this.defaultConfig = {
        project_name: 'default',
        description: 'Default testing configuration using Claude Sonnet 4',
        endpoints: [
          {
            name: 'claude-sonnet-4-vertex',
            type: 'google-vertexai-claude-connector',
          },
        ],
        default_tests: ['common-risk-easy'],
        default_metrics: ['bertscore', 'toxicity-classifier'],
        created_at: now,
        updated_at: now,
      };
      
      return this.defaultConfig;
    }
  }

  async setDefaultConfig(projectName: string): Promise<void> {
    const config = await this.loadProject(projectName);
    this.defaultConfig = config;
    
    // Save as default
    const defaultPath = path.join(this.configDir, 'default.json');
    await fs.writeFile(
      defaultPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  // Load endpoint configurations from moonshot-data
  async loadEndpointPresets(dataPath: string): Promise<Record<string, any>> {
    const endpointsPath = path.join(dataPath, 'connectors-endpoints');
    const presets: Record<string, any> = {};

    try {
      const files = await fs.readdir(endpointsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(endpointsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const preset = JSON.parse(content);
          const name = file.replace('.json', '');
          presets[name] = preset;
        }
      }
    } catch (error) {
      console.error('Failed to load endpoint presets:', error);
    }

    return presets;
  }

  // Create project from template
  async createFromTemplate(templateName: string, projectName: string): Promise<ProjectConfig> {
    const templates: Record<string, Partial<ProjectConfig>> = {
      'general-safety': {
        description: 'General safety and security testing',
        default_tests: ['common-risk-easy', 'mlc-ai-safety', 'challenging-toxicity-prompts'],
        default_metrics: ['toxicity-classifier', 'refusal', 'cybersecevalannotator'],
      },
      'bias-fairness': {
        description: 'Bias and fairness evaluation',
        default_tests: ['bbq-lite', 'cbbq-lite', 'fairness-uciadult'],
        default_metrics: ['genderbias_metric', 'fairness'],
      },
      'singapore-local': {
        description: 'Singapore context and localization testing',
        default_tests: ['singapore-context', 'singapore-pofma-statements', 'singapore-safety-questions'],
        default_metrics: ['exactstrmatch', 'bertscore'],
      },
      'medical-domain': {
        description: 'Medical and healthcare domain testing',
        default_tests: ['medical-llm-leaderboard', 'medmcqa', 'medqa-us'],
        default_metrics: ['exactstrmatch', 'faithfulness'],
      },
      'security-focused': {
        description: 'Security and robustness testing',
        default_tests: ['cyberseceval-cookbook-all-languages', 'jailbreak-dan', 'prompt_injection_jailbreak'],
        default_metrics: ['cybersecevalannotator', 'refusal'],
      },
      'multilingual': {
        description: 'Multilingual capability testing',
        default_tests: ['tamil-language-cookbook', 'chinese-safety-cookbook', 'answercarefully-cookbook-all-languages'],
        default_metrics: ['bertscore', 'answerrelevance'],
      },
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    return this.createProject({
      project_name: projectName,
      ...template,
    });
  }

  // Export configuration for sharing
  async exportConfig(projectName: string, outputPath: string): Promise<void> {
    const config = await this.loadProject(projectName);
    
    // Remove sensitive information
    const exportConfig = {
      ...config,
      endpoints: config.endpoints.map(ep => ({
        ...ep,
        token: ep.token ? '***REDACTED***' : undefined,
      })),
    };

    await fs.writeFile(
      outputPath,
      JSON.stringify(exportConfig, null, 2),
      'utf-8'
    );
  }

  // Import configuration
  async importConfig(configPath: string, newName?: string): Promise<ProjectConfig> {
    const configData = await fs.readFile(configPath, 'utf-8');
    const imported = ProjectConfigSchema.parse(JSON.parse(configData));
    
    if (newName) {
      imported.project_name = newName;
    }
    
    imported.updated_at = new Date().toISOString();
    
    await this.saveProject(imported);
    return imported;
  }

  async getLatestProjectConfig(): Promise<ProjectConfig | null> {
    try {
      const files = await fs.readdir(this.configDir);
      const configFiles = files.filter(file => file.endsWith('.json'));
      
      if (configFiles.length === 0) {
        return null;
      }
      
      // Sort by modification time (most recent first)
      const fileStats = await Promise.all(
        configFiles.map(async (file) => {
          const filePath = path.join(this.configDir, file);
          const stats = await fs.stat(filePath);
          return { file, mtime: stats.mtime };
        })
      );
      
      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      const latestFile = fileStats[0].file;
      
      // Read and parse the latest config
      const configPath = path.join(this.configDir, latestFile);
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      return ProjectConfigSchema.parse(config);
      
    } catch (error) {
      console.error('Error getting latest project config:', error);
      return null;
    }
  }
}