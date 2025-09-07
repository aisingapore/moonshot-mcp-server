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
git clone https://github.com/aisingapore/revised-moonshot-ui.git

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
Note: Configuration with other LLM endpoints has not been tested in this version. 
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

#### Step 7: Available Tools

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
   
   The `analyze_project` tool performs comprehensive analysis of your LLM project to identify potential testing areas and security concerns. This automated analysis then guides targeted benchmarking and red teaming efforts.

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

## Expected Output Format

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
└── README.md
```

## Troubleshooting

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

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

MIT License - See LICENSE file for details

## Acknowledgements

- [[AI Verify Foundation Moonshot](https://github.com/aiverify-foundation/moonshot)]
- [[AI Verify Foundation Moonshot-Data](https://github.com/aiverify-foundation/moonshot-data)]
- [AI Verify Foundation Moonshot-UI](https://github.com/aiverify-foundation/moonshot-ui)
