/**
 * Usage Examples for Moonshot MCP Server
 * 
 * These examples demonstrate how to interact with the MCP server
 * through various MCP clients.
 */

// Example 1: Basic bias and toxicity testing
const basicTest = {
  tool: "test_llm",
  arguments: {
    query: "Test my chatbot for bias and toxicity issues"
  }
};

// Example 2: Comprehensive safety testing
const safetyTest = {
  tool: "test_llm",
  arguments: {
    query: "Run comprehensive safety tests including bias, toxicity, hallucination, and security vulnerabilities",
    project_config: "my-safety-project"
  }
};

// Example 3: Domain-specific testing (Medical)
const medicalTest = {
  tool: "test_llm",
  arguments: {
    query: "Test my medical AI assistant for accuracy, factual correctness, and appropriate medical advice"
  }
};

// Example 4: Singapore context testing
const singaporeTest = {
  tool: "test_llm",
  arguments: {
    query: "Check if my model understands Singapore context, local slang, and government policies"
  }
};

// Example 5: Run specific benchmark
const benchmarkTest = {
  tool: "run_benchmark",
  arguments: {
    cookbook: "common-risk-easy",
    endpoints: ["openai-gpt35-turbo", "anthropic-claude-3-sonnet"],
    num_workers: 2
  }
};

// Example 6: Red teaming session
const redTeamTest = {
  tool: "red_team",
  arguments: {
    model: "my-production-model",
    attack_module: "jailbreak"
  }
};

// Example 7: Analyze previous results
const analyzeResults = {
  tool: "analyze_results",
  arguments: {
    metric_focus: ["toxicity", "bias", "hallucination"]
  }
};

// Example 8: List available resources
const listCookbooks = {
  tool: "list_resources",
  arguments: {
    resource_type: "cookbooks",
    filter: "singapore"
  }
};

// Example 9: Configure a new project
const configureProject = {
  tool: "configure_project",
  arguments: {
    project_name: "production-safety-tests",
    endpoints: [
      {
        name: "prod-gpt4",
        type: "openai-connector",
        params: {
          model: "gpt-4",
          api_key: process.env.OPENAI_API_KEY
        }
      },
      {
        name: "prod-claude",
        type: "anthropic-connector",
        params: {
          model: "claude-3-opus-20240229",
          api_key: process.env.ANTHROPIC_API_KEY
        }
      }
    ],
    default_tests: ["common-risk-hard", "mlc-ai-safety", "cyberseceval-cookbook"]
  }
};

// Example 10: Multi-language testing
const multilingualTest = {
  tool: "test_llm",
  arguments: {
    query: "Test my model's performance in English, Chinese, Tamil, and Malay, focusing on cultural sensitivity and accuracy"
  }
};

// Example 11: Compliance testing
const complianceTest = {
  tool: "test_llm",
  arguments: {
    query: "Check if my AI system complies with Singapore's AI governance guidelines and IMDA requirements"
  }
};

// Example 12: Performance benchmarking
const performanceTest = {
  tool: "test_llm",
  arguments: {
    query: "Benchmark my model's performance on standard tasks like MMLU, GSM8K, and HellaSwag"
  }
};

// Natural language queries that the system can understand:
const naturalLanguageExamples = [
  "Test my chatbot for harmful content and biases",
  "Is my medical AI safe to deploy?",
  "Check if my model can be jailbroken",
  "Test Singapore-specific knowledge and context",
  "Run security audit on my LLM application",
  "Evaluate factual accuracy and hallucination rates",
  "Test my model in multiple languages",
  "Check compliance with AI safety standards",
  "Compare GPT-4 and Claude on safety metrics",
  "Find vulnerabilities in my prompt handling",
  "Test my model's understanding of local culture",
  "Evaluate my chatbot's response to toxic prompts"
];

// Export for use in other scripts
module.exports = {
  basicTest,
  safetyTest,
  medicalTest,
  singaporeTest,
  benchmarkTest,
  redTeamTest,
  analyzeResults,
  listCookbooks,
  configureProject,
  multilingualTest,
  complianceTest,
  performanceTest,
  naturalLanguageExamples
};