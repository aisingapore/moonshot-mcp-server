import { EndpointRegistry, EndpointConfig } from './endpoint-registry.js';
import { z } from 'zod';

// Schema for endpoint configuration validation
const EndpointConfigSchema = z.object({
  name: z.string().min(1, 'Endpoint name is required'),
  connector_type: z.string().min(1, 'Connector type is required'),
  model: z.string().min(1, 'Model is required'),
  uri: z.string().optional(),
  token: z.string().optional(),
  max_calls_per_second: z.number().positive().optional(),
  max_concurrency: z.number().positive().optional(),
  params: z.record(z.any()).optional(),
});

export interface EndpointConfigurationError {
  code: 'ENDPOINT_NOT_FOUND' | 'REGISTRATION_FAILED' | 'VALIDATION_ERROR' | 'CONFIGURATION_REQUIRED';
  message: string;
  suggestions?: string[];
  template?: EndpointConfig;
}

export class EndpointConfigurator {
  private registry: EndpointRegistry;

  constructor() {
    this.registry = new EndpointRegistry();
  }

  /**
   * Ensure endpoint is ready for use in Moonshot backend
   * Throws detailed error if endpoint cannot be configured
   */
  async ensureEndpointReady(endpointName: string): Promise<void> {
    try {
      // Try to ensure endpoint is registered
      const result = await this.registry.ensureEndpointRegistered(endpointName);
      
      if (!result.success) {
        // Get available configurations and suggestions
        const availableConfigs = await this.registry.listAvailableConfigs();
        const suggestions = await this.registry.getSuggestedEndpoints(endpointName);
        
        const error: EndpointConfigurationError = {
          code: 'ENDPOINT_NOT_FOUND',
          message: `Endpoint '${endpointName}' is not configured in Moonshot backend and no configuration file found. ${result.message}`,
          suggestions: suggestions.length > 0 ? suggestions : availableConfigs,
        };
        
        throw error;
      }

      console.log(`✅ Endpoint '${endpointName}' is ready for use`);
      
    } catch (error: any) {
      if (error.code) {
        // Re-throw our custom errors
        throw error;
      }
      
      // Handle unexpected errors
      const configError: EndpointConfigurationError = {
        code: 'REGISTRATION_FAILED',
        message: `Failed to configure endpoint '${endpointName}': ${error.message}`,
      };
      throw configError;
    }
  }

  /**
   * Register a custom endpoint configuration
   */
  async registerCustomEndpoint(config: Partial<EndpointConfig>): Promise<void> {
    try {
      // Validate configuration
      const validatedConfig = EndpointConfigSchema.parse(config);
      
      // Suggest connector type if not provided
      if (!validatedConfig.connector_type) {
        validatedConfig.connector_type = EndpointRegistry.getConnectorTypeSuggestion(validatedConfig.name);
      }
      
      // Register the endpoint
      const result = await this.registry.registerCustomEndpoint(validatedConfig);
      
      if (!result.success) {
        const error: EndpointConfigurationError = {
          code: 'REGISTRATION_FAILED',
          message: result.message,
        };
        throw error;
      }

      console.log(`✅ Custom endpoint '${validatedConfig.name}' registered successfully`);
      
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const error_details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        const configError: EndpointConfigurationError = {
          code: 'VALIDATION_ERROR',
          message: `Invalid endpoint configuration: ${error_details}`,
        };
        throw configError;
      }
      
      if (error.code) {
        throw error;
      }
      
      const configError: EndpointConfigurationError = {
        code: 'REGISTRATION_FAILED',
        message: `Failed to register custom endpoint: ${error.message}`,
      };
      throw configError;
    }
  }

  /**
   * Get endpoint configuration template for user
   */
  async getEndpointConfigurationTemplate(endpointName: string, modelHint?: string): Promise<EndpointConfig> {
    const connectorType = EndpointRegistry.getConnectorTypeSuggestion(endpointName);
    const model = modelHint || 'your-model-name';
    
    // Create template based on connector type
    const baseTemplate = EndpointRegistry.createEndpointTemplate(endpointName, connectorType, model);
    
    // Add connector-specific defaults
    switch (connectorType) {
      case 'anthropic-connector':
        return {
          ...baseTemplate,
          uri: 'https://api.anthropic.com',
          token: 'your-anthropic-api-key',
          params: {
            temperature: 0.5,
            max_tokens: 4096,
            timeout: 300,
          },
        };
        
      case 'openai-connector':
        return {
          ...baseTemplate,
          uri: 'https://api.openai.com/v1',
          token: 'your-openai-api-key',
          params: {
            temperature: 0.7,
            max_tokens: 2000,
            timeout: 300,
          },
        };
        
      case 'google-vertexai-claude-connector':
        return {
          ...baseTemplate,
          uri: 'DEFAULT',
          token: 'your-gcp-api-key',
          params: {
            project_id: 'your-gcp-project-id',
            region: 'us-east5',
            temperature: 0.5,
            max_tokens: 4096,
            timeout: 300,
          },
        };
        
      case 'amazon-bedrock-connector':
        return {
          ...baseTemplate,
          uri: '',
          token: '',
          params: {
            region: 'us-east-1',
            aws_access_key_id: 'your-aws-access-key',
            aws_secret_access_key: 'your-aws-secret-key',
            temperature: 0.7,
            max_tokens: 2000,
          },
        };
        
      case 'azure-openai-connector':
        return {
          ...baseTemplate,
          uri: 'your-azure-openai-endpoint',
          token: 'your-azure-openai-key',
          params: {
            api_version: '2024-02-15-preview',
            deployment_name: 'your-deployment-name',
            temperature: 0.7,
            max_tokens: 2000,
          },
        };
        
      case 'ollama-connector':
        return {
          ...baseTemplate,
          uri: 'http://localhost:11434',
          token: '',
          params: {
            temperature: 0.7,
            num_predict: 2000,
          },
        };
        
      default:
        return baseTemplate;
    }
  }

  /**
   * List all available endpoint configurations
   */
  async listAvailableEndpoints(): Promise<{
    available_configs: string[];
    registered_endpoints: Array<{name: string; connector_type: string; model: string}>;
  }> {
    const [availableConfigs, registeredEndpoints] = await Promise.all([
      this.registry.listAvailableConfigs(),
      this.registry.listRegisteredEndpoints(),
    ]);
    
    return {
      available_configs: availableConfigs,
      registered_endpoints: registeredEndpoints,
    };
  }

  /**
   * Get user-friendly error message with configuration instructions
   */
  formatConfigurationError(error: EndpointConfigurationError): string {
    let message = `❌ ${error.message}\n\n`;
    
    switch (error.code) {
      case 'ENDPOINT_NOT_FOUND':
        message += "🔧 To fix this issue:\n\n";
        message += "Option 1: Use an available pre-configured endpoint\n";
        if (error.suggestions && error.suggestions.length > 0) {
          message += "Available endpoints:\n";
          error.suggestions.forEach(suggestion => {
            message += `  - ${suggestion}\n`;
          });
        }
        message += "\nOption 2: Configure your custom endpoint using the MCP server\n";
        message += "Provide endpoint configuration when prompted.\n";
        break;
        
      case 'CONFIGURATION_REQUIRED':
        message += "🔧 Please provide endpoint configuration:\n\n";
        if (error.template) {
          message += "Configuration template:\n";
          message += JSON.stringify(error.template, null, 2);
        }
        break;
        
      case 'VALIDATION_ERROR':
        message += "🔧 Please check your endpoint configuration format.\n";
        break;
        
      case 'REGISTRATION_FAILED':
        message += "🔧 Please check your Moonshot backend setup and try again.\n";
        break;
    }
    
    return message;
  }

  /**
   * Interactive endpoint configuration helper
   */
  async promptForEndpointConfiguration(endpointName: string): Promise<EndpointConfig> {
    // Get template
    const template = await this.getEndpointConfigurationTemplate(endpointName);
    
    const error: EndpointConfigurationError = {
      code: 'CONFIGURATION_REQUIRED',
      message: `Endpoint '${endpointName}' requires configuration`,
      template,
    };
    
    throw error;
  }
}