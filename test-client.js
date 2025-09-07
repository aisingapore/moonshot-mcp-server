#!/usr/bin/env node

/**
 * Simple test client for Moonshot MCP Server
 * Use this to test the MCP server without Claude Desktop
 */

import { spawn, execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

class MCPTestClient {
  constructor() {
    this.process = null;
    this.messageId = 1;
    this.waitingForCustomQuery = false;
    this.customQueryType = null;
    this.outputDir = './test-outputs';
    this.waitingForResponse = false;
    this.pendingAskQuestion = null;
    this.questionActive = false;
    this.rl = null;
    this.pendingToolCalls = new Map(); // Track tool calls by message ID
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${this.outputDir}`);
    }
  }

  showMenu(isStartup = false) {
    const title = isStartup ? '\n🎯 MCP Server is ready! Try these commands:' : '\n🎯 Available commands:';
    console.log(title);
    console.log('1. analyze_project - Analyze a project and get recommendations for benchmarking and red teaming');
    console.log('2. benchmarking - Run benchmarking tests using recommended cookbooks or manually specified ones');
    console.log('3. security_red_team - Run security-focused red teaming with recommended attack modules');
    console.log('4. custom - Enter your own natural language query');
    console.log('5. list_endpoints - List available and registered LLM endpoints');
    console.log('6. list_cookbooks - List available test cookbooks');
    console.log('7. view_outputs - View saved markdown outputs');
    console.log('8. clear_sessions - Clear all red teaming sessions');
    console.log('9. quit - Exit the client\n');
  }

  async start() {
    console.log('🚀 Starting Moonshot MCP Test Client...\n');

    // Start the MCP server process
    this.process = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    // Set up readline for user input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Handle server responses
    this.process.stdout.on('data', (data) => {
      const response = data.toString();
      
      // Split by newlines to handle multiple messages
      const lines = response.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Check if it's a JSON-RPC response
        if (line.startsWith('{') && (line.includes('"result"') || line.includes('"error"'))) {
          try {
            const parsed = JSON.parse(line);
            console.log('📋 Server Response:', JSON.stringify(parsed, null, 2));
            
            // Save response as markdown if it contains tool content
            if (parsed.result && parsed.result.content && parsed.result.content[0] && parsed.result.content[0].text) {
              const toolName = this.pendingToolCalls.get(parsed.id);
              this.saveResponseAsMarkdown(parsed, parsed.id || Date.now(), toolName);
              // Clean up the pending tool call
              if (parsed.id) {
                this.pendingToolCalls.delete(parsed.id);
              }
            }
            
            // If we're waiting for a response, trigger the next question
            if (this.waitingForResponse) {
              this.waitingForResponse = false;
              if (this.pendingAskQuestion) {
                console.log('[DEBUG] Tool completed, showing menu and asking next question...');
                this.showMenu(); // Show menu before asking for next command
                this.pendingAskQuestion();
                this.pendingAskQuestion = null;
              }
            }
          } catch (e) {
            console.log('📄 Server Output:', line);
          }
        } else {
          // Debug output or other non-JSON content
          console.log('📄 Server Output:', line);
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      console.error('❌ Server Error:', data.toString());
    });

    // Initialize the server
    await this.sendInitialize();

    this.showMenu(true);
    this.askQuestion();
  }

  askQuestion() {
    if (this.questionActive) {
      console.log('[DEBUG] Question already active, skipping duplicate call');
      return;
    }
    
    console.log('[DEBUG] Setting up new question prompt...');
    this.questionActive = true;
    const promptText = this.waitingForCustomQuery ? '' : '🤖 Enter command: ';
    this.rl.question(promptText, async (answer) => {
        console.log(`[DEBUG] Received user input: "${answer}"`);
        const input = answer.trim();

        // Handle custom query input
        if (this.waitingForCustomQuery) {
          this.waitingForCustomQuery = false;
          await this.testLLM(input);
          this.customQueryType = null;
          this.questionActive = false;
          this.askQuestion();
          return;
        }

        const command = input.toLowerCase();
        if (command === 'quit') {
          console.log('👋 Goodbye!');
          this.process.kill();
          this.rl.close();
          return;
        }

        // Handle empty command (user just pressed Enter)
        if (command === '') {
          console.log('❓ Unknown command. Try: analyze_project, benchmarking, security_red_team, custom, list_endpoints, list_cookbooks, view_outputs, clear_sessions, or quit');
          this.questionActive = false;
          this.askQuestion();
          return;
        }

        await this.handleCommand(command);
        
        // For tool commands that require waiting for server response, delay the next question
        const toolCommands = ['analyze_project', 'benchmarking', 'security_red_team', 'custom'];
        if (toolCommands.includes(command)) {
          this.waitingForResponse = true;
          this.pendingAskQuestion = () => {
            this.questionActive = false;
            this.askQuestion();
          };
        } else {
          this.questionActive = false;
          this.askQuestion();
        }
      });
  }

  async sendInitialize() {
    const initMessage = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'moonshot-test-client',
          version: '1.0.0'
        }
      }
    };

    this.sendMessage(initMessage);
  }

  async handleCommand(command) {
    switch (command) {
      case 'list_cookbooks':
        await this.listResources('cookbooks');
        break;
      
      
      case 'analyze_project':
        await this.testAnalyzeProject();
        break;
      
      case 'benchmarking':
        await this.testBenchmarking();
        break;
      
      case 'security_red_team':
        await this.testSecurityRedTeam();
        break;
      
      
      case 'custom':
        await this.testCustom();
        break;
      
      case 'list_endpoints':
        this.listEndpoints();
        break;
      
      case 'clear_sessions':
        this.clearSessions();
        break;
      
      case 'view_outputs':
        this.viewSavedOutputs();
        break;
      
      default:
        console.log('❓ Unknown command. Try: analyze_project, benchmarking, security_red_team, custom, list_endpoints, list_cookbooks, view_outputs, clear_sessions, or quit');
    }
  }

  async testLLM(query) {
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'test_llm',
        arguments: {
          query: query
        }
      }
    };

    console.log(`🔍 Testing with query: "${query}"`);
    this.sendMessage(message);
  }


  


  async listResources(type) {
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'list_resources',
        arguments: {
          resource_type: type
        }
      }
    };

    console.log(`📚 Listing ${type}...`);
    this.sendMessage(message);
  }

  viewSavedOutputs() {
    try {
      const files = fs.readdirSync(this.outputDir)
        .filter(file => file.endsWith('.md'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(this.outputDir, a));
          const statB = fs.statSync(path.join(this.outputDir, b));
          return statB.mtime - statA.mtime; // Most recent first
        });
      
      if (files.length === 0) {
        console.log('📝 No saved outputs found.');
        return;
      }
      
      console.log(`\n📁 Saved outputs in ${this.outputDir}:`);
      files.forEach((file, index) => {
        const filePath = path.join(this.outputDir, file);
        const stats = fs.statSync(filePath);
        const timeAgo = this.timeAgo(stats.mtime);
        console.log(`${index + 1}. ${file} (${timeAgo})`);
      });
      
      console.log(`\n💡 You can open these markdown files in any markdown viewer or IDE.`);
      console.log(`   Full path: ${path.resolve(this.outputDir)}`);
      
    } catch (error) {
      console.error('❌ Failed to list outputs:', error.message);
    }
  }
  
  timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    
    return Math.floor(seconds) + " seconds ago";
  }

  async testSecurityRedTeam() {
    console.log('\n🛡️ Security Red Team Testing');
    console.log('This will analyze a project for security vulnerabilities and run appropriate attack modules.\n');
    
    // Create a readline interface specifically for this interaction
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      const projectPath = await this.askQuestion(rl, '📂 Enter project path to analyze: ');
      if (!projectPath.trim()) {
        console.log('❌ Project path is required');
        rl.close();
        return;
      }
      
      const endpointsInput = await this.askQuestion(rl, '🎯 Enter target endpoints (comma-separated, or press Enter for google-vertexai-claude-sonnet-4): ');
      const endpoints = endpointsInput.trim() 
        ? endpointsInput.split(',').map(e => e.trim())
        : ['google-vertexai-claude-sonnet-4']; // Default to Claude 4 Sonnet ID
      
      const focusInput = await this.askQuestion(rl, '🔍 Enter security focus areas (comma-separated, or press Enter for auto-detect):\n' +
        '   Options: prompt_injection, jailbreak, data_leakage, input_validation, adversarial_input, social_engineering, bias_exploitation, privacy_violation\n' +
        '   Focus: ');
      const securityFocus = focusInput.trim()
        ? focusInput.split(',').map(f => f.trim())
        : undefined;
      
      console.log('\n🔍 Starting security red team analysis...');
      console.log(`📂 Project: ${projectPath}`);
      console.log(`🎯 Endpoints: ${endpoints.join(', ')}`);
      console.log(`🔍 Focus: ${securityFocus ? securityFocus.join(', ') : 'Auto-detect based on project analysis'}\n`);
      
      const message = {
        jsonrpc: '2.0',
        id: this.messageId++,
        method: 'tools/call',
        params: {
          name: 'security_red_team',
          arguments: {
            project_path: projectPath.trim(),
            target_endpoints: endpoints,
            security_focus: securityFocus,
            automated: true
          }
        }
      };
      
      console.log('⚡ Executing security red team tests...');
      this.sendMessage(message);
      
    } catch (error) {
      console.error('❌ Security red team setup failed:', error.message);
      
      // Show helpful tips
      console.log('\n💡 Tips:');
      console.log('• Ensure the project path exists and contains LLM application code');
      console.log('• Make sure Claude Sonnet 4 endpoint is configured in Moonshot');
      console.log('• Check that the Moonshot API server is running on http://localhost:5000');
      
    } finally {
      rl.close();
    }
  }

  listEndpoints() {
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'list_endpoints',
        arguments: {
          show_available: true,
          show_registered: true
        }
      }
    };

    console.log('📡 Listing available and registered endpoints...');
    this.sendMessage(message);
  }

  clearSessions() {
    console.log('🗑️ Clearing all generated session files...');
    console.log('⚠️ This will remove ALL .db files, .json files from databases, runners, and results directories.');
    
    try {
      // Get current directory for ES modules
      const currentDir = path.dirname(new URL(import.meta.url).pathname);
      const dbPath = path.join(currentDir, '..', 'revised-moonshot-data', 'generated-outputs', 'databases');
      const runnerPath = path.join(currentDir, '..', 'revised-moonshot-data', 'generated-outputs', 'runners');
      const resultsPath = path.join(currentDir, '..', 'revised-moonshot-data', 'generated-outputs', 'results');
      
      console.log(`📁 Database path: ${dbPath}`);
      console.log(`📁 Runner path: ${runnerPath}`);
      console.log(`📁 Results path: ${resultsPath}`);
      
      // List existing files - ALL files, not just red-team ones
      const listDbCommand = process.platform === 'win32' ? 
        `dir "${dbPath}\\*.db" /B 2>nul || echo "No database files found"` :
        `ls "${dbPath}"/*.db 2>/dev/null || echo "No database files found"`;
      
      const listRunnerCommand = process.platform === 'win32' ? 
        `dir "${runnerPath}\\*.json" /B 2>nul || echo "No runner files found"` :
        `ls "${runnerPath}"/*.json 2>/dev/null || echo "No runner files found"`;

      const listResultsCommand = process.platform === 'win32' ? 
        `dir "${resultsPath}\\*.json" /B 2>nul || echo "No results files found"` :
        `ls "${resultsPath}"/*.json 2>/dev/null || echo "No results files found"`;
      
      console.log('📋 Existing database files:');
      const existingDbs = execSync(listDbCommand, { encoding: 'utf8' });
      console.log(existingDbs);
      
      console.log('📋 Existing runner files:');
      const existingRunners = execSync(listRunnerCommand, { encoding: 'utf8' });
      console.log(existingRunners);

      console.log('📋 Existing results files:');
      const existingResults = execSync(listResultsCommand, { encoding: 'utf8' });
      console.log(existingResults);
      
      // Remove ALL database files
      const cleanDbCommand = process.platform === 'win32' ?
        `del /Q "${dbPath}\\*.db" 2>nul || echo "No database files to clean"` :
        `rm -f "${dbPath}"/*.db 2>/dev/null || echo "No database files to clean"`;
        
      // Remove ALL runner files  
      const cleanRunnerCommand = process.platform === 'win32' ?
        `del /Q "${runnerPath}\\*.json" 2>nul || echo "No runner files to clean"` :
        `rm -f "${runnerPath}"/*.json 2>/dev/null || echo "No runner files to clean"`;

      // Remove ALL results files  
      const cleanResultsCommand = process.platform === 'win32' ?
        `del /Q "${resultsPath}\\*.json" 2>nul || echo "No results files to clean"` :
        `rm -f "${resultsPath}"/*.json 2>/dev/null || echo "No results files to clean"`;
        
      console.log('🗑️ Cleaning database files...');
      const dbResult = execSync(cleanDbCommand, { encoding: 'utf8' });
      console.log(dbResult);
      
      console.log('🗑️ Cleaning runner files...');
      const runnerResult = execSync(cleanRunnerCommand, { encoding: 'utf8' });
      console.log(runnerResult);

      console.log('🗑️ Cleaning results files...');
      const resultsResult = execSync(cleanResultsCommand, { encoding: 'utf8' });
      console.log(resultsResult);
      
      console.log('✅ All generated session files cleared successfully!');
      
    } catch (error) {
      console.error('❌ Error clearing sessions:', error.message);
      console.log('💡 You can manually delete files in:');
      console.log('   - revised-moonshot-data/generated-outputs/databases/*.db');
      console.log('   - revised-moonshot-data/generated-outputs/runners/*.json');
      console.log('   - revised-moonshot-data/generated-outputs/results/*.json');
    }
  }
  
  askQuestionPromise(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  sendMessage(message) {
    // Track tool calls by message ID
    if (message.method === 'tools/call' && message.params && message.params.name) {
      this.pendingToolCalls.set(message.id, message.params.name);
    }
    
    const messageStr = JSON.stringify(message) + '\n';
    this.process.stdin.write(messageStr);
  }

  saveResponseAsMarkdown(parsed, messageId, toolName) {
    try {
      // Skip saving for custom tool since MCP server saves a more complete version
      if (toolName === 'custom') {
        console.log(`💾 Skipping test client markdown save for ${toolName} - MCP server saves complete version`);
        return;
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Use specific naming for different tools
      let filename;
      if (toolName === 'analyze_project') {
        filename = `moonshot-response-projanalysis-${timestamp}-${messageId}.md`;
      } else if (toolName === 'benchmarking') {
        filename = `moonshot-response-benchmarking-${timestamp}-${messageId}.md`;
      } else if (toolName === 'security_red_team') {
        filename = `moonshot-response-redteam-${timestamp}-${messageId}.md`;
      } else if (toolName === 'custom') {
        filename = `moonshot-response-custom-${timestamp}-${messageId}.md`;
      } else {
        filename = `moonshot-response-${timestamp}-${messageId}.md`;
      }
      const filepath = path.join(this.outputDir, filename);
      
      let markdown = '';
      
      // Add header with metadata
      markdown += `# Moonshot MCP Server Response\n\n`;
      markdown += `**Timestamp:** ${new Date().toISOString()}\n`;
      markdown += `**Message ID:** ${messageId}\n`;
      if (toolName) {
        markdown += `**Tool:** ${toolName}\n`;
      }
      markdown += `\n`;
      
      // Extract tool information if available
      if (parsed.result && parsed.result.content) {
        const content = parsed.result.content[0];
        if (content.text) {
          markdown += `**Tool Response:**\n\n`;
          
          // Check if the text already contains markdown formatting
          const text = content.text;
          if (text.includes('**') || text.includes('#') || text.includes('•') || text.includes('-')) {
            // Already formatted as markdown
            markdown += text;
          } else {
            // Plain text, add basic formatting
            markdown += '```\n';
            markdown += text;
            markdown += '\n```';
          }
        }
      }
      
      // Add raw JSON as collapsible section
      markdown += `\n\n## Raw JSON Response\n\n`;
      markdown += `<details>\n<summary>Click to expand JSON</summary>\n\n`;
      markdown += '```json\n';
      markdown += JSON.stringify(parsed, null, 2);
      markdown += '\n```\n\n';
      markdown += '</details>\n';
      
      // Write to file
      fs.writeFileSync(filepath, markdown, 'utf-8');
      console.log(`💾 Response saved to: ${filepath}`);
      
    } catch (error) {
      console.error('❌ Failed to save response as markdown:', error.message);
    }
  }

  async loadLatestAnalysisResults() {
    try {
      // Look for the most recent projanalysis file specifically
      const files = fs.readdirSync(this.outputDir)
        .filter(file => file.startsWith('moonshot-response-projanalysis-') && file.endsWith('.md'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(this.outputDir, a));
          const statB = fs.statSync(path.join(this.outputDir, b));
          return statB.mtime - statA.mtime; // Most recent first
        });

      if (files.length === 0) {
        console.log('📋 No analysis recommendations found in recent files');
        console.log('💡 Please run analyze_project first to generate project analysis');
        return null;
      }

      const latestFile = path.join(this.outputDir, files[0]);
      const content = fs.readFileSync(latestFile, 'utf-8');
      
      // Parse the markdown content to extract recommendations
      const analysisResults = {
        recommended_benchmarking_options: [],
        recommended_redteaming_options: [],
        security_concerns: [],
        priority_test_areas: [],
        data_sensitivity_level: 'medium'
      };

      const lines = content.split('\n');
      let currentSection = null;

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Identify sections
        if (trimmedLine.includes('Recommended Benchmarking Cookbooks') || 
            trimmedLine.match(/##\s*Recommended.*Benchmark/i)) {
          currentSection = 'benchmarking_cookbooks';
          continue;
        }
        
        if (trimmedLine.includes('Recommended Red Teaming Modules') || 
            trimmedLine.match(/##\s*Recommended.*Red.*Team/i)) {
          currentSection = 'redteaming_modules';
          continue;
        }
        
        if (trimmedLine.includes('Security Concerns') || 
            trimmedLine.match(/##\s*Security.*Concern/i)) {
          currentSection = 'security_concerns';
          continue;
        }
        
        if (trimmedLine.includes('Priority Test Areas') || 
            trimmedLine.match(/##\s*Priority.*Test/i)) {
          currentSection = 'priority_test_areas';
          continue;
        }
        
        // Extract data sensitivity level
        if (trimmedLine.includes('Data Sensitivity:')) {
          const match = trimmedLine.match(/Data Sensitivity:\s*(\w+)/i);
          if (match) {
            analysisResults.data_sensitivity_level = match[1].toLowerCase();
          }
          continue;
        }
        
        // Reset section on new headers
        if (trimmedLine.startsWith('##') || trimmedLine.startsWith('**')) {
          if (!['benchmarking_cookbooks', 'redteaming_modules', 'security_concerns', 'priority_test_areas'].some(s => 
              trimmedLine.toLowerCase().includes(s.replace('_', ' ')))) {
            currentSection = null;
          }
          continue;
        }
        
        // Extract list items
        if (currentSection && (trimmedLine.startsWith('- ') || trimmedLine.startsWith('• '))) {
          const item = trimmedLine.substring(2).trim();
          if (item) {
            switch (currentSection) {
              case 'benchmarking_cookbooks':
                analysisResults.recommended_benchmarking_options.push(item);
                break;
              case 'redteaming_modules':
                analysisResults.recommended_redteaming_options.push(item);
                break;
              case 'security_concerns':
                analysisResults.security_concerns.push(item);
                break;
              case 'priority_test_areas':
                analysisResults.priority_test_areas.push(item);
                break;
            }
          }
        }
      }

      // Check if we found any recommendations
      const hasRecommendations = analysisResults.recommended_benchmarking_options.length > 0 || 
                                analysisResults.recommended_redteaming_options.length > 0;
      
      if (hasRecommendations) {
        console.log(`📋 Loaded analysis results from: ${path.basename(latestFile)}`);
        console.log(`   📚 Benchmarking cookbooks: ${analysisResults.recommended_benchmarking_options.length}`);
        console.log(`   ⚔️ Red teaming modules: ${analysisResults.recommended_redteaming_options.length}`);
        return analysisResults;
      } else {
        console.log('📋 No analysis recommendations found in recent files');
        return null;
      }
      
    } catch (error) {
      console.log(`📋 Could not load analysis results: ${error.message}`);
      return null;
    }
  }

  async testAnalyzeProject() {
    console.log('\n🔍 Project Analysis');
    console.log('This will analyze a project to identify its type, frameworks, security concerns, and recommend appropriate tests.\n');
    
    // Prompt for project path
    const projectPath = await this.askQuestionPromise('📁 Enter project path to analyze: ');
    
    // Optional: Prompt for ignore rules
    const ignoreRulesInput = await this.askQuestionPromise('🚫 Enter files/patterns to ignore (comma-separated, or press Enter to skip): ');
    
    if (!projectPath) {
      console.log('❌ Project path is required');
      return;
    }
    
    // Prepare arguments
    const args = { project_path: projectPath };
    if (ignoreRulesInput) {
      args.user_ignore_rules = ignoreRulesInput.split(',').map(rule => rule.trim()).filter(rule => rule);
    }
    
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'analyze_project',
        arguments: args
      }
    };
    
    console.log(`🔍 Analyzing project: ${projectPath}`);
    if (args.user_ignore_rules) {
      console.log(`🚫 Ignoring: ${args.user_ignore_rules.join(', ')}`);
    }
    this.sendMessage(message);
  }

  async testBenchmarking() {
    console.log('\n📊 Benchmarking Tests');
    console.log('This will run benchmarking tests using recommended cookbooks or manually specified ones.\n');
    
    // Try to load analysis results first
    const analysisResults = await this.loadLatestAnalysisResults();
    
    // Prompt for target endpoints
    const endpointsInput = await this.askQuestionPromise('🎯 Enter target endpoints (comma-separated): ');
    
    // Show available recommendations if any
    let recommendationText = '';
    if (analysisResults?.recommended_benchmarking_options) {
      recommendationText = ` (Recommended: ${analysisResults.recommended_benchmarking_options.join(', ')})`;
    }
    
    // Optional: Prompt for specific cookbooks
    const cookbooksInput = await this.askQuestionPromise(`📚 Enter specific cookbooks to run (comma-separated, or press Enter to use recommendations)${recommendationText}: `);
    
    // Optional: Prompt for number of workers
    const workersInput = await this.askQuestionPromise('⚙️ Enter number of workers (or press Enter for default 1): ');
    
    if (!endpointsInput) {
      console.log('❌ Target endpoints are required');
      return;
    }
    
    // Prepare arguments
    const args = {
      target_endpoints: endpointsInput.split(',').map(ep => ep.trim()).filter(ep => ep)
    };
    
    if (cookbooksInput) {
      // User specified cookbooks manually
      args.cookbooks = cookbooksInput.split(',').map(cb => cb.trim()).filter(cb => cb);
      console.log(`📚 Using user-specified cookbooks: ${args.cookbooks.join(', ')}`);
    } else if (analysisResults?.recommended_benchmarking_options) {
      // Use recommendations from analysis
      args.project_analysis = {
        recommended_benchmarking_options: analysisResults.recommended_benchmarking_options,
        priority_test_areas: analysisResults.priority_test_areas || [],
        data_sensitivity_level: analysisResults.data_sensitivity_level || 'medium'
      };
      console.log(`📚 Using recommended cookbooks from analysis: ${analysisResults.recommended_benchmarking_options.join(', ')}`);
    } else {
      console.log('⚠️ No analysis results found and no cookbooks specified. Will use MCP server defaults.');
    }
    
    if (workersInput && !isNaN(parseInt(workersInput))) {
      args.num_workers = parseInt(workersInput);
    }
    
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'benchmarking',
        arguments: args
      }
    };
    
    console.log(`📊 Running benchmarking tests on endpoints: ${args.target_endpoints.join(', ')}`);
    console.log(`⚙️ Workers: ${args.num_workers || 1}`);
    this.sendMessage(message);
  }

  async testSecurityRedTeam() {
    console.log('\n🛡️ Security Red Team Testing');
    console.log('This will run security red teaming tests using recommended attack modules or manually specified ones.\n');
    
    // Try to load analysis results first
    const analysisResults = await this.loadLatestAnalysisResults();
    
    // Prompt for target endpoints
    const endpointsInput = await this.askQuestionPromise('🎯 Enter target endpoints (comma-separated): ');
    
    // Show available recommendations if any
    let recommendationText = '';
    if (analysisResults?.recommended_redteaming_options) {
      recommendationText = ` (Recommended: ${analysisResults.recommended_redteaming_options.join(', ')})`;
    }
    
    // Optional: Prompt for specific attack modules
    const attackModulesInput = await this.askQuestionPromise(`⚔️ Enter specific attack modules (comma-separated, or press Enter to use recommendations)${recommendationText}: `);
    
    if (!endpointsInput) {
      console.log('❌ Target endpoints are required');
      return;
    }
    
    // Prepare arguments
    const args = {
      target_endpoints: endpointsInput.split(',').map(ep => ep.trim()).filter(ep => ep)
    };
    
    if (attackModulesInput) {
      // User specified attack modules manually
      args.attack_modules = attackModulesInput.split(',').map(am => am.trim()).filter(am => am);
      console.log(`⚔️ Using user-specified attack modules: ${args.attack_modules.join(', ')}`);
    } else if (analysisResults?.recommended_redteaming_options) {
      // Use recommendations from analysis
      args.project_analysis = {
        recommended_redteaming_options: analysisResults.recommended_redteaming_options,
        security_concerns: analysisResults.security_concerns || [],
        priority_test_areas: analysisResults.priority_test_areas || []
      };
      console.log(`⚔️ Using recommended attack modules from analysis: ${analysisResults.recommended_redteaming_options.join(', ')}`);
    } else {
      console.log('⚠️ No analysis results found and no attack modules specified. Will use MCP server defaults.');
    }
    
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'security_red_team',
        arguments: args
      }
    };
    
    console.log(`🛡️ Running security red teaming on endpoints: ${args.target_endpoints.join(', ')}`);
    this.sendMessage(message);
  }

  async testCustom() {
    console.log('\n🎯 Custom Natural Language Query');
    console.log('This will process your natural language query and automatically select and run appropriate tests.\n');
    
    // Prompt for natural language query
    const query = await this.askQuestionPromise('💬 Enter your natural language query: ');
    
    if (!query) {
      console.log('❌ Query is required');
      return;
    }
    
    // Prompt for target endpoints
    const endpointsInput = await this.askQuestionPromise('🎯 Enter target endpoints (comma-separated, or press Enter for google-vertexai-claude-sonnet-4): ');
    const endpoints = endpointsInput.trim() 
      ? endpointsInput.split(',').map(e => e.trim())
      : ['google-vertexai-claude-sonnet-4']; // Default to Claude 4 Sonnet ID
    
    console.log('\n🚀 Processing custom query...');
    console.log(`💬 Query: ${query}`);
    console.log(`🎯 Endpoints: ${endpoints.join(', ')}\n`);
    
    const message = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'custom',
        arguments: {
          query: query,
          endpoints: endpoints
        }
      }
    };
    
    console.log('⚡ Executing custom analysis...');
    this.sendMessage(message);
  }
}

// Start the test client
const client = new MCPTestClient();
client.start().catch(console.error);