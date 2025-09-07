# Moonshot MCP Server

A Model Context Protocol (MCP) server that provides natural language interface to AI Verify's Moonshot framework for testing LLM applications.

## Overview

This MCP server allows developers to test their LLM applications against AI Verify's comprehensive testing framework using natural language commands. Instead of writing complex test configurations, developers can simply describe what they want to test in plain English.

## Features

- **Natural Language Testing**: Describe your testing needs in plain English
- **Comprehensive Test Suites**: Access to 50+ pre-built cookbooks and 100+ datasets
- **Multiple LLM Support**: Test against OpenAI, Anthropic, AWS Bedrock, Azure, Google, and more
- **Red Teaming**: Interactive adversarial testing with attack modules
- **Project Management**: Save and reuse testing configurations
- **Smart Test Selection**: AI-powered selection of relevant tests based on your requirements
- **Multi-test support**: Currently supports single benchmarking and/or redteaming test per dataset or attack-module, although supports multiple datasets and attack-modules. 
- **Disclaimer**: Not all the tests will be working as this is purely a Proof-Of-Concept, and there may be dataset ground truth errors or scenarios where certain examples may fail. Welcome any contributions for fixes and feature improvements!

## Installation

```bash
# Make a new project directory
mkdir <project-directory>
cd <project-directory>

# PREREQUISITES - Clone these repositories
# Note: Some files in moonshot and moonshot-data have been revised in these new repositories.
git clone https://github.com/aisingapore/moonshot-mcp-server.git
git clone https://github.com/aisingapore/revised-moonshot.git
git clone https://github.com/aisingapore/revised-moonshot-data.git

# Set up the data directory symlink to revised-moonshot-data
cd revised-moonshot
sed -i 's/\r$//' setup_data_link.sh
bash setup_data_link.sh

# Set up virtual environment
uv sync            # Creates .venv using pyproject.toml - requires-python = "==3.12.3"
source .venv/bin/activate   # Activates virtual environment aiverify-moonshot
```

## Configuration Guide with Claude Sonnet 4 via Google Cloud Vertex AI

### Complete Setup Instructions

This guide provides step-by-step instructions for setting up the Moonshot MCP Server with Claude Sonnet 4 for intelligent natural language query processing.

#### Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Vertex AI API** enabled in your GCP project
3. **Application Default Credentials** (ADC) configured
4. **Moonshot framework** installed and configured

### Step 1: LLM Endpoint Configuration - e.g., Setting Up Claude 4 Sonnet
The server works best with Claude 4 Sonnet configured via Google Vertex AI. Create a new file to configure the endpoint at:
`../revised-moonshot-data/connectors-endpoints/google-vertexai-claude-sonnet-4.json`

```json
{
    "name": "claude-sonnet-4-vertex",
    "connector_type": "google-vertexai-claude-connector",
    "uri": "DEFAULT",
    "token": "your-gcp-project-api-key",
    "max_calls_per_second": 2,
    "max_concurrency": 1,
    "model": "claude-sonnet-4@20250514",
    "params": {
        "timeout": 300,
        "max_attempts": 3,
        "temperature": 0.5,
        "max_tokens": 4096,
        "project_id": "your-gcp-project-id",
        "region": "us-east5"
    }
}
```

#### Step 2: Environment Setup

Configure your `moonshot-mcp-server/.env` file with the following settings:

```bash
# Edit .env with your API keys - Currently works for Option 1: Use Claude via Google Cloud Vertex AI
cd ../moonshot-mcp-server
cp .env.example .env

# Query Processor Configuration - Claude Sonnet 4 via Vertex AI
QUERY_PROCESSOR_PROVIDER=vertex-ai
QUERY_PROCESSOR_MODEL=claude-sonnet-4@20250514
GCP_PROJECT_ID=your-gcp-project-id
GCP_REGION=us-east5
GCP_SERVICE_ACCOUNT_KEY_PATH=
# Leave empty to use Application Default Credentials

# Moonshot API Configuration  
MOONSHOT_API_URL=http://localhost:5000
MOONSHOT_DATA_PATH=../revised-moonshot-data

# Moonshot Data Directory Configuration
MOONSHOT_DATA_ROOT=<project-directory>/revised-moonshot-data    # Update to your project directory path
```

#### Step 3: Google Cloud Authentication

Set up Application Default Credentials:

```bash
# Install Google Cloud SDK if not already installed
gcloud auth application-default login

# Verify authentication
gcloud auth list                 # ensure correct GCP account
gcloud config get-value project  # ensure correct GCP Project ID 
```

#### Step 4: Connecting to Claude Sonnet 4
```bash
cd ./scripts
chmod +x setup-claude-endpoint.sh
sed -i 's/\r$//' setup-claude-endpoint.sh
bash setup-claude-endpoint.sh
```


#### Step 5: Start Moonshot API Server

**Terminal 1** - Start the Moonshot web API with all required environment variables:

```bash
cd ../../revised-moonshot
python -m moonshot web-api
```

Wait for the message: `✓ Moonshot API is running on http://localhost:5000`

#### Step 6: Build and Test MCP Server

**Terminal 2** - Build and test the MCP server:

```bash
# activate the same virtual environment for running MCP server
cd <project-directory>/revised-moonshot
source .venv/bin/activate
cd ../moonshot-mcp-server

# Install dependencies (if not already done)
npm install

# Build the project
npm run build

# Test the server
node test-client.js
```

#### Step 7: Test Commands

Try these commands in the test client:

1. **List Available Cookbooks and LLM Endpoints:**
   ```
   list_cookbooks
   ```
   Expected: List of 18+ available cookbooks with descriptions saved to markdown file
   Note: This might take some time.

   ```
   list_endpoints
   ```
   Expected: List of registered LLM endpoints with descriptions saved to markdown file

   ```
   clear_sessions
   ```
   Expected: Clears all active Moonshot sessions and resets the testing environment. Useful for cleanup between different testing runs or when encountering session conflicts.

2. **Analyze Project for Benchmarking and Redteaming:**
   
   The `analyze_project` command performs comprehensive analysis of your LLM project to identify potential testing areas and security concerns. This automated analysis then guides targeted benchmarking and red teaming efforts.

   **Step 2a: Project Analysis**
   ```
   analyze_project
   ```
   Enter your project path and files to ignore when prompted:
   ```
   Enter project path: /path/to/your/llm-project
   Enter files/patterns to ignore (comma-separated, or press Enter to skip): .env,logs
   ```
   
   Expected output includes:
   - **Project Overview**: Detected frameworks, LLM integrations, and key components
   - **Security Concerns**: Identified potential vulnerabilities (prompt injection, jailbreaks, etc.)
   - **Testing Recommendations**: Suggested cookbooks and metrics based on project analysis
   - **Risk Assessment**: Overall risk score and priority areas for testing
   - **Endpoint Compatibility**: Available LLM endpoints that can be used for testing

   **Step 2b: Benchmarking (Performance & Capability Testing)**
   
   After project analysis, run comprehensive benchmarking:
   ```
   benchmarking
   ```
   Enter your configured LLM endpoint and cookbooks to run when prompted:
   ```
   Enter target endpoints (comma-separated): google-vertexai-claude-sonnet-4
   Enter specific cookbooks to run (comma-separated, or press Enter to use recommendations) (Recommended: <this will show based on your most recent project analysis outcome>): <Enter>
   ```

   Or Select from recommended cookbooks based on your project type:
   - **General Purpose**: `mmlu-all`, `hellaswag`, `gsm8k` for broad capability assessment
   - **Safety Focus**: `common-risk-easy`, `mlc-ai-safety` for basic safety evaluation  
   - **Domain Specific**: `medical-llm-leaderboard` (medical), `singapore-context` (local knowledge)
   - **Bias & Fairness**: `bbq-lite`, `cbbq-lite`, `winobias` for bias detection
   
   Example benchmark execution:
   ```
   Cookbook name: mlc-ai-safety
   Endpoints: google-vertexai-claude-sonnet-4
   Number of workers: 1
   ```

   **Step 2c: Security Red Teaming (Adversarial Testing)**
   
   For security-focused testing, use the automated red teaming tool:
   ```
   security_red_team
   ```
   Provide the required parameters:
   ```
   Target endpoints: google-vertexai-claude-sonnet-4
   Enter specific attack modules (comma-separated, or presss Enter to use recommendations) (Recommended: <this will show based on your most recent project analysis outcome>): <Enter>
   ```

   Or Select from recommended security red team attack modules based on your project type:
   - **Maps Security Concerns to Attack Modules**:
     - Prompt Injection → `payload_mask_attack`, `malicious_question_generator`
     - Jailbreak Attempts → `malicious_question_generator`, `textfooler_attack` 
     - Input Validation → `homoglyph_attack`, `charswap_attack`, `insert_punctuation_attack`
     - Adversarial Inputs → `textbugger_attack`, `textfooler_attack`, `homoglyph_v2_attack`
     - Social Engineering → `job_role_generator`, `malicious_question_generator`
   - **Executes Attack Modules**: Runs selected attacks against your LLM endpoints
   - **Provides Security Assessment**: Overall security score, vulnerability ratings, and recommendations

   **Expected Comprehensive Output:**
   - **Benchmark Results**: Performance scores across capability areas (reasoning, knowledge, safety)
   - **Security Assessment**: Vulnerability scores, attack success rates, critical findings
   - **Risk Prioritization**: Ranked list of security and performance issues
   - **Actionable Recommendations**: Specific steps to improve model robustness
   - **Compliance Insights**: Alignment with AI safety standards and regulations

3. **Custom Natural Language Query:**
  The `custom` command allows you to describe your testing needs in natural language. Here are examples of effective queries:
  Note: You must include a project folder location and some testing criteria for it to work as intended.

  
  Example 1:
   ```
   custom
   ```
   Then enter: 
   ```
   Test my project at <folder location> for basic safety and toxicity issues. ignore all other files like .env, logs.
   ```
   Followed by the configured model endpoint: 
   ```
   google-vertexai-claude-sonnet-4
   ```
   Expected: AI-powered analysis suggesting appropriate safety and toxicity tests

  Example 2:
   ```
   custom
   Enter your natural language query: test my project at <folder location> for singapore data
   ```
   Expected: Intelligent recommendations for Singapore-specific testing

  Example 3:
  **Safety & Toxicity Testing:**
  ```
  custom
  Enter your natural language query: Test my chatbot at <folder location> for harmful content and toxicity issues
  ```
  Expected AI recommendations: `challenging-toxicity-prompts`, `mlc-ai-safety`, `toxicity-classifier` metric

  Example 4:
  **Bias & Fairness Evaluation:**
  ```
  custom
  Enter your natural language query: Check if my model at <folder location> shows gender or racial bias in responses
  ```
  Expected AI recommendations: `bbq-lite`, `cbbq-lite`, `winobias`, `genderbias_metric` metric

  Example 5:
  **Medical Domain Testing:**
  ```
  custom
  Enter your natural language query: Evaluate my medical AI at <folder location> for accuracy and hallucinations
  ```
  Expected AI recommendations: `medical-llm-leaderboard`, `medmcqa`, `faithfulness`, `answerrelevance` metrics

  Example 6:
  **Singapore Context Assessment:**
  ```
  custom
  Enter your natural language query: Test understanding of Singapore culture and local knowledge for project at <folder location>
  ```
  Expected AI recommendations: `singapore-context`, `singapore-pofma-statements`, `bertscore` metric

  Example 7:
  **Security & Prompt Injection:**
  ```
  custom
  Enter your natural language query: Check for jailbreak vulnerabilities and prompt injection attacks in <folder location>
  ```
  Expected AI recommendations: `cyberseceval-cookbook`, `jailbreak-dan`, `cybersecevalannotator` metric

  Example 8:
  **Multilingual Capabilities:**
  ```
  custom
  Enter your natural language query: Test my model's performance with Chinese language safety at <folder location>
  ```
  Expected AI recommendations: `chinese-safety-cookbook`, `cvalues`, `toxicity-classifier` metric

  Example 9:
  **Comprehensive Risk Assessment:**
  ```
  custom
  Enter your natural language query: Run a full safety audit covering bias, toxicity, and security for <folder location>
  ```
  Expected AI recommendations: `common-risk-hard`, `mlc-ai-safety`, multiple metrics for comprehensive evaluation

  Example 10:
  **Performance & Accuracy Testing:**
  ```
  custom
  Enter your natural language query: Evaluate general knowledge and reasoning capabilities on <folder location>
  ```
  Expected AI recommendations: `mmlu-all`, `hellaswag`, `gsm8k`, `exactstrmatch`, `bertscore` metrics


#### Key Features Working

- ✅ **Claude Sonnet 4 Integration**: Natural language understanding via Google Cloud Vertex AI
- ✅ **Intelligent Test Selection**: AI-powered cookbook and metric recommendations  
- ✅ **Clean Terminal Interface**: No character doubling in custom input mode
- ✅ **Robust JSON Parsing**: Handles markdown-formatted responses from Claude
- ✅ **Comprehensive Logging**: Debug information for troubleshooting
- ✅ **Error Handling**: Graceful fallback to rule-based parsing if needed
- ✅ **Dataset Constraint Retry Logic**: Automatic retry mechanism when no dataset matches found

## 🔄 Dataset Constraint Retry System (v1.2.0)

### Overview
The system now includes intelligent retry logic to handle dataset constraint mismatches. When constrained datasets don't contain matching examples, the system automatically retries with different random examples until a match is found within the specified constraints.

### Key Update Summary
- **Problem**: When recipes are constrained to specific datasets (e.g., `singapore-facts-mcq` limited to transport, housing, political datasets), questions from excluded datasets (e.g., food-related questions in `singapore-food-tnf`) would cause test failures
- **Solution**: Automatic retry mechanism that requests new random examples from Moonshot until finding questions that exist within the constrained datasets
- **Benefit**: Maintains dataset constraints while ensuring tests can complete successfully

### How It Works
1. **Dataset Match Check**: System checks if the random question exists in constrained datasets
2. **Warning Display**: Prints clear warnings when dataset mismatches occur
3. **Automatic Retry**: Retries benchmark execution up to 5 times with different random examples
4. **Success Continuation**: Continues with test when matching example found
5. **Graceful Failure**: Provides informative message if no matches found after max retries

### Implementation Details
- **Max Retries**: 5 attempts (configurable)
- **Warning Messages**: Clear dataset constraint mismatch notifications
- **Debug Logging**: Detailed retry attempt tracking
- **Constraint Preservation**: Maintains recipe dataset restrictions as intended

### Example Scenarios
- **Recipe**: `singapore-facts-mcq` (constrained to: transport, housing, political, iconic-places)
- **Random Question**: "Fish dumplings vs gyoza" (exists in `singapore-food-tnf` - **excluded**)
- **System Response**: Warns about mismatch, retries with new random question until finding one in allowed datasets

### ⚠️ Important Disclaimers

**Dataset Coverage Limitation**: The retry system maintains recipe dataset constraints by design. If your testing requires comprehensive coverage of all available datasets, consider:
- Using recipes that include the specific datasets you need
- Running multiple recipes to cover different dataset categories
- Creating custom recipes that include your required datasets

**Performance Impact**: The retry mechanism may increase test execution time when dataset mismatches are frequent. The system is optimized to minimize retries by providing clear warnings about constraint mismatches.

#### Expected Output Format

When using natural language queries, the system returns structured recommendations:

```
✅ Successfully parsed your testing request!

🎯 **Query**: "test for singapore data"
🔍 **Focus Areas**: singapore, capability  
📋 **Test Types**: benchmark, comprehensive
🎪 **Confidence**: 95%

📚 **Recommended Cookbooks**:
  • singapore-context
  • singapore-pofma-statements
  
📊 **Recommended Metrics**:
  • bertscore
  • exactstrmatch
  
⚠️ **Specific Concerns**:
  • Local knowledge evaluation
  • Singapore context understanding

🤖 *Powered by Claude Sonnet 4 via Google Cloud Vertex AI*
```

#### File Structure

```
moonshot-mcp-server/
├── src/
│   ├── index.ts              # MCP server with improved test intent formatting
│   ├── moonshot-client.ts    # API client with 150s timeout for large responses  
│   ├── query-processor.ts    # Claude Sonnet 4 integration with robust JSON parsing
│   └── config-manager.ts     # Project configuration management
├── test-client.js            # Fixed terminal interface (no character doubling)
├── .env                      # Vertex AI configuration
└── DOCUMENTATION.md
```

#### Troubleshooting

**Claude Sonnet 4 Issues:**
- Ensure GCP project has billing enabled
- Verify Claude Sonnet 4 is available in your region (try `us-east5`)
- Check Application Default Credentials are properly configured

**Moonshot API Issues:**
- Verify all environment variables are set correctly
- Check API is accessible at `http://localhost:5000/health`
- Check LLM endpoints available at `http://localhost:5000/api/v1/llm-endpoints`
- Check Moonshot Cookbooks accessible at `http://localhost:5000/api/v1/cookbooks`
- Ensure sufficient timeout (150s) for large cookbook responses

**Terminal Interface Issues:**
- Character doubling fixed by using single readline interface
- Custom query prompt displays immediately after typing "custom"

## Support

For issues and questions:
- GitHub Issues: [Report issues]
- Documentation: [AI Verify Moonshot Docs]
- Community: [AI Verify Foundation]


### MCP Client Configuration

Add to your MCP client's configuration file (e.g., for Claude Desktop):

```json
{
  "mcpServers": {
    "moonshot": {
      "command": "node",
      "args": ["/path/to/moonshot-mcp-server/dist/index.js"],
      "env": {
        "QUERY_PROCESSOR_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Usage Examples

### Basic Testing

```
User: "Test my chatbot for bias and toxicity"

The MCP server will:
1. Analyze your request
2. Select relevant test suites (BBQ-lite for bias, toxicity prompts)
3. Run the tests against your configured endpoints
4. Provide detailed results with grades and recommendations
```

### Specific Domain Testing

```
User: "Check if my medical AI model has good factual accuracy and doesn't hallucinate"

The MCP server will:
1. Select medical domain tests (MedMCQA, MedQA)
2. Apply hallucination detection metrics (faithfulness, truthfulness)
3. Run comprehensive medical knowledge evaluation
```

### Singapore Context

```
User: "Test my model's understanding of Singapore context and local knowledge"

The MCP server will:
1. Use Singapore-specific datasets
2. Test local language understanding (Singlish)
3. Evaluate knowledge of local facts, policies, and culture
```

### Security Testing

```
User: "Red team my model for jailbreaks and prompt injections"

The MCP server will:
1. Start an interactive red teaming session
2. Apply various attack modules
3. Test for security vulnerabilities
4. Provide detailed security assessment
```

## Available Tools

### 🛡️ **security_red_team** (New in v1.1.0)
Analyzes a project for security concerns and automatically runs appropriate Moonshot red teaming tests.

**Purpose**: Provides comprehensive security testing by analyzing your LLM project code, identifying potential vulnerabilities, and automatically selecting and running the most relevant Moonshot attack modules.

**Parameters:**
- `project_path` (required): Path to the LLM project folder to analyze
- `target_endpoints` (required): Array of LLM endpoints to test (e.g., `["claude-sonnet-4-vertex"]`)
- `security_focus` (optional): Array of specific security areas to focus on
- `automated` (optional): Boolean, whether to run automated tests (default: true)

**Security Focus Areas:**
- `prompt_injection`: Test for prompt injection vulnerabilities
- `jailbreak`: Test for jailbreak attempts  
- `data_leakage`: Test for data leakage risks
- `input_validation`: Test input validation robustness
- `adversarial_input`: Test adversarial input handling
- `social_engineering`: Test social engineering resistance
- `bias_exploitation`: Test bias exploitation vulnerabilities
- `privacy_violation`: Test privacy violation risks

**Attack Module Mapping:**
The tool automatically maps identified security concerns to appropriate Moonshot attack modules:

- **Prompt Injection** → `payload_mask_attack`, `malicious_question_generator`
- **Jailbreak** → `malicious_question_generator`, `textfooler_attack`
- **Input Validation** → `homoglyph_attack`, `charswap_attack`, `insert_punctuation_attack`
- **Adversarial Input** → `textbugger_attack`, `textfooler_attack`, `homoglyph_v2_attack`
- **Social Engineering** → `job_role_generator`, `malicious_question_generator`
- **Bias Exploitation** → `toxic_sentence_generator`, `violent_durian`
- **Privacy Violation** → `malicious_question_generator`

**Example Usage:**
```json
{
  "tool": "security_red_team",
  "arguments": {
    "project_path": "/path/to/my-chatbot-app",
    "target_endpoints": ["claude-sonnet-4-vertex"],
    "security_focus": ["prompt_injection", "jailbreak"],
    "automated": true
  }
}
```

**Output:** Comprehensive security assessment including:
- Project analysis summary with identified security concerns
- Overall security score and vulnerability ratings
- Detailed results for each attack module executed
- Critical vulnerabilities found with examples
- Specific security recommendations
- List of available and used endpoints

### 1. `test_llm`
Test your LLM using natural language description.

**Parameters:**
- `query`: Natural language description of what to test
- `project_config`: (Optional) Project configuration name

**Example:**
```
"test my model for bias, toxicity, and Singapore context understanding"
```

### 2. `run_benchmark`
Run specific benchmark cookbooks.

**Parameters:**
- `cookbook`: Name of the cookbook to run
- `endpoints`: List of endpoints to test
- `num_workers`: Number of parallel workers

**Available Cookbooks:**
- `common-risk-easy/hard`: General safety assessment
- `singapore-context`: Local knowledge testing
- `medical-llm-leaderboard`: Medical domain evaluation
- `cyberseceval-cookbook`: Security testing
- `mlc-ai-safety`: Comprehensive AI safety
- And many more...

### 3. `red_team`
Start an interactive red teaming session.

**Parameters:**
- `model`: Model endpoint to test
- `attack_module`: (Optional) Specific attack to use
- `context_strategy`: (Optional) Context management strategy

**Attack Modules:**
- `homoglyph_attack`: Character substitution
- `jailbreak`: Jailbreak attempts
- `prompt_injection`: Injection attacks
- `malicious_question_generator`: Adversarial prompts

### 4. `analyze_results`
Analyze test results and get insights.

**Parameters:**
- `run_id`: (Optional) Specific run to analyze
- `metric_focus`: (Optional) Metrics to focus on

### 5. `list_resources`
List available testing resources.

**Parameters:**
- `resource_type`: Type of resource (cookbooks, datasets, metrics, attack_modules, endpoints)
- `filter`: (Optional) Filter pattern

### 6. `configure_project`
Configure project-specific settings.

**Parameters:**
- `project_name`: Name for the configuration
- `endpoints`: LLM endpoints to test
- `default_tests`: Default test suites to run

## Endpoint Configuration

### Setting Up Claude 4 Sonnet
The server works best with Claude 4 Sonnet configured via Google Vertex AI. Configure the endpoint at:
`../revised-moonshot-data/connectors-endpoints/google-vertexai-claude-sonnet-4.json`

```json
{
    "name": "claude-sonnet-4-vertex",
    "connector_type": "google-vertexai-claude-connector",
    "params": {
        "project_id": "your-gcp-project-id",
        "region": "us-east5"
    }
}
```

### Endpoint Compatibility Checking
The `security_red_team` tool automatically:
1. Checks which endpoints are available and working
2. Filters to only use compatible endpoints
3. Shows clear error messages if no compatible endpoints found
4. Reports which endpoints were actually used in the results

## Security Testing Workflow

The `security_red_team` tool follows this comprehensive workflow:

1. **Project Analysis**: LLM analyzes your project code to identify security concerns
2. **Attack Planning**: Maps security concerns to appropriate Moonshot attack modules
3. **Endpoint Validation**: Verifies target endpoints are available and working
4. **Red Team Execution**: Runs selected attack modules against your LLM
5. **Results Analysis**: Provides comprehensive security assessment with recommendations

**Security Assessment Output:**
- Overall security score (0-100%)
- Critical vulnerabilities with severity levels
- Attack success rates for each module
- Example attacks and model responses
- Actionable security recommendations
- List of endpoints tested

## Project Templates

Quick-start templates for common testing scenarios:

### General Safety
```javascript
{
  "project_name": "my-safety-tests",
  "template": "general-safety"
}
```

### Bias & Fairness
```javascript
{
  "project_name": "fairness-evaluation",
  "template": "bias-fairness"
}
```

### Medical Domain
```javascript
{
  "project_name": "medical-ai-tests",
  "template": "medical-domain"
}
```

### Security Focused
```javascript
{
  "project_name": "security-audit",
  "template": "security-focused"
}
```

## Integration with Different LLM Projects

### OpenAI GPT Models
```javascript
{
  "endpoints": [
    {
      "name": "gpt-4",
      "type": "openai-connector",
      "params": {
        "model": "gpt-4",
        "api_key": "your-key"
      }
    }
  ]
}
```

### Anthropic Claude
```javascript
{
  "endpoints": [
    {
      "name": "claude-3-sonnet",
      "type": "anthropic-connector",
      "params": {
        "model": "claude-3-sonnet-20240229",
        "api_key": "your-key"
      }
    }
  ]
}
```

### AWS Bedrock
```javascript
{
  "endpoints": [
    {
      "name": "bedrock-claude",
      "type": "amazon-bedrock-connector",
      "params": {
        "model_id": "anthropic.claude-3-sonnet",
        "region": "us-east-1"
      }
    }
  ]
}
```

### Local Models (Ollama)
```javascript
{
  "endpoints": [
    {
      "name": "local-llama",
      "type": "ollama-connector",
      "params": {
        "model": "llama2",
        "base_url": "http://localhost:11434"
      }
    }
  ]
}
```

## Architecture

```
moonshot-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── moonshot-client.ts    # Moonshot API client
│   ├── query-processor.ts    # Natural language understanding
│   └── config-manager.ts     # Project configuration management
├── configs/                  # Saved project configurations
├── package.json
└── DOCUMENTATION.md
```

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Troubleshooting

### Connection Issues
- Ensure Moonshot API is running on the configured port
- Check firewall settings
- Verify API keys are correctly set

### Test Execution Failures
- Check endpoint configurations
- Verify model API keys
- Ensure sufficient rate limits

### Query Understanding Issues
- Verify query processor API key
- Check if the LLM provider is accessible
- Use more specific testing descriptions

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

MIT License - See LICENSE file for details

## Acknowledgements

- [[AI Verify Foundation Moonshot](https://github.com/aiverify-foundation/moonshot)]
- [[AI Verify Foundation Moonshot-Data](https://github.com/aiverify-foundation/moonshot-data)]
- [AI Verify Foundation Moonshot-UI](https://github.com/aiverify-foundation/moonshot-ui)