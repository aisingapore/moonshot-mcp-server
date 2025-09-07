import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export interface EndpointConfig {
  name: string;
  connector_type: string;
  model: string;
  uri?: string;
  token?: string;
  max_calls_per_second?: number;
  max_concurrency?: number;
  params?: Record<string, any>;
}

export interface EndpointRegistrationResult {
  success: boolean;
  message: string;
  endpoint_id?: string;
}

export class EndpointRegistry {
  private scriptPath: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.scriptPath = path.join(__dirname, '..', 'scripts', 'endpoint-manager.py');
  }

  private async runScript(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('python3', [this.scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Script failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Register an endpoint by name (loads from moonshot-data directory)
   */
  async registerEndpointByName(endpointName: string): Promise<EndpointRegistrationResult> {
    try {
      const result = await this.runScript(['register', endpointName]);
      return {
        success: true,
        message: result,
        endpoint_id: this.extractEndpointId(result),
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to register endpoint '${endpointName}': ${error.message}`,
      };
    }
  }

  /**
   * Register a custom endpoint configuration
   */
  async registerCustomEndpoint(config: EndpointConfig): Promise<EndpointRegistrationResult> {
    try {
      const configJson = JSON.stringify(config);
      const result = await this.runScript(['register-json', configJson]);
      return {
        success: true,
        message: result,
        endpoint_id: this.extractEndpointId(result),
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to register custom endpoint '${config.name}': ${error.message}`,
      };
    }
  }

  /**
   * Check if an endpoint exists in the registry
   */
  async checkEndpointExists(endpointName: string): Promise<boolean> {
    try {
      const result = await this.runScript(['check', endpointName]);
      return result.includes('exists');
    } catch (error) {
      return false;
    }
  }

  /**
   * List available endpoint configurations
   */
  async listAvailableConfigs(): Promise<string[]> {
    try {
      const result = await this.runScript(['list-available']);
      const lines = result.split('\n').slice(1); // Skip header
      return lines
        .filter(line => line.startsWith('  - '))
        .map(line => line.replace('  - ', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * List registered endpoints
   */
  async listRegisteredEndpoints(): Promise<Array<{name: string; connector_type: string; model: string}>> {
    try {
      const result = await this.runScript(['list-registered']);
      const lines = result.split('\n').slice(1); // Skip header
      return lines
        .filter(line => line.startsWith('  - '))
        .map(line => {
          const match = line.match(/^  - (.+) \((.+), (.+)\)$/);
          if (match) {
            return {
              name: match[1],
              connector_type: match[2],
              model: match[3],
            };
          }
          return null;
        })
        .filter(Boolean) as Array<{name: string; connector_type: string; model: string}>;
    } catch (error) {
      return [];
    }
  }

  /**
   * Ensure endpoint is registered before use
   */
  async ensureEndpointRegistered(endpointName: string): Promise<EndpointRegistrationResult> {
    // Check if already registered
    const exists = await this.checkEndpointExists(endpointName);
    if (exists) {
      return {
        success: true,
        message: `Endpoint '${endpointName}' is already registered`,
      };
    }

    // Try to register from available configs
    return await this.registerEndpointByName(endpointName);
  }

  /**
   * Get suggested endpoint configurations based on model name
   */
  async getSuggestedEndpoints(modelHint?: string): Promise<string[]> {
    const available = await this.listAvailableConfigs();
    
    if (!modelHint) {
      return available;
    }

    const hint = modelHint.toLowerCase();
    const suggestions = available.filter(config => {
      const configLower = config.toLowerCase();
      return (
        configLower.includes(hint) ||
        (hint.includes('claude') && configLower.includes('claude')) ||
        (hint.includes('gpt') && configLower.includes('gpt')) ||
        (hint.includes('llama') && configLower.includes('llama'))
      );
    });

    return suggestions.length > 0 ? suggestions : available;
  }

  private extractEndpointId(result: string): string | undefined {
    const match = result.match(/with ID: (.+)$/);
    return match ? match[1] : undefined;
  }

  /**
   * Create endpoint configuration template for user
   */
  static createEndpointTemplate(
    name: string,
    connectorType: string,
    model: string,
    options: Partial<EndpointConfig> = {}
  ): EndpointConfig {
    return {
      name,
      connector_type: connectorType,
      model,
      uri: options.uri || '',
      token: options.token || '',
      max_calls_per_second: options.max_calls_per_second || 2,
      max_concurrency: options.max_concurrency || 1,
      params: options.params || {},
    };
  }

  /**
   * Get connector type suggestions based on endpoint name
   */
  static getConnectorTypeSuggestion(endpointName: string): string {
    const name = endpointName.toLowerCase();
    
    if (name.includes('openai') || name.includes('gpt')) {
      return 'openai-connector';
    } else if (name.includes('anthropic') || name.includes('claude')) {
      return 'anthropic-connector';
    } else if (name.includes('bedrock')) {
      return 'amazon-bedrock-connector';
    } else if (name.includes('azure')) {
      return 'azure-openai-connector';
    } else if (name.includes('vertex') || name.includes('vertexai')) {
      return 'google-vertexai-claude-connector';
    } else if (name.includes('gemini')) {
      return 'google-gemini-connector';
    } else if (name.includes('together')) {
      return 'together-connector';
    } else if (name.includes('ollama')) {
      return 'ollama-connector';
    } else if (name.includes('huggingface')) {
      return 'huggingface-connector';
    }
    
    return 'custom-connector';
  }
}