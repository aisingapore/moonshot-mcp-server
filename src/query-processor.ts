import axios from 'axios';
import { z } from 'zod';
import { GoogleAuth } from 'google-auth-library';
import { LLMProjectAnalyzer, LLMProjectAnalysis, LLMAnalyzer } from './llm-project-analyzer.js';
import { promises as fs } from 'fs';
import path from 'path';

// Intent schema
const TestingIntentSchema = z.object({
  original_query: z.string(),
  focus_areas: z.array(z.string()),
  test_types: z.array(z.string()),
  specific_concerns: z.array(z.string()),
  models_mentioned: z.array(z.string()),
  confidence: z.number(),
  suggested_cookbooks: z.array(z.string()),
  suggested_redteam: z.array(z.string()),
  suggested_metrics: z.array(z.string()),
  project_path: z.string().optional(),
  project_analysis: z.any().optional(),
  is_project_query: z.boolean().default(false),
});

export type TestingIntent = z.infer<typeof TestingIntentSchema>;

// Configuration for LLM-based query processing
const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'vertex-ai', 'local']).default('anthropic'),
  api_key: z.string().optional(),
  model: z.string().default('claude-3-sonnet-20240229'),
  base_url: z.string().optional(),
  temperature: z.number().default(0.3),
  gcp_project_id: z.string().optional(),
  gcp_region: z.string().optional(),
  gcp_service_account_key_path: z.string().optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export class QueryProcessor implements LLMAnalyzer {
  private config: LLMConfig;
  private systemPrompt: string;
  public llmProjectAnalyzer: LLMProjectAnalyzer;

  constructor(config?: Partial<LLMConfig>) {
    this.config = LLMConfigSchema.parse(config || {
      provider: process.env.QUERY_PROCESSOR_PROVIDER || 'vertex-ai',
      api_key: process.env.QUERY_PROCESSOR_API_KEY || process.env.ANTHROPIC_API_KEY,
      model: process.env.QUERY_PROCESSOR_MODEL || 'claude-3-sonnet@20240229',
      gcp_project_id: process.env.GCP_PROJECT_ID,
      gcp_region: process.env.GCP_REGION || 'us-central1',
      gcp_service_account_key_path: process.env.GCP_SERVICE_ACCOUNT_KEY_PATH,
    });

    console.log(`[DEBUG] Query processor config: provider=${this.config.provider}, model=${this.config.model}, project=${this.config.gcp_project_id}`);
    this.llmProjectAnalyzer = new LLMProjectAnalyzer(this);
    // System prompt will be built lazily when needed
    this.systemPrompt = '';
  }

  private async buildSystemPrompt(): Promise<string> {
    // Get actual available resources dynamically
    const [availableCookbooks, availableRecipes, availableDatasets, availableAttackModules] = await Promise.all([
      this.llmProjectAnalyzer.getAvailableCookbooks(),
      this.llmProjectAnalyzer.getAvailableRecipes(), 
      this.llmProjectAnalyzer.getAvailableDatasets(),
      this.llmProjectAnalyzer.getAvailableAttackModules()
    ]);

    const cookbooksList = availableCookbooks.map(name => `- ${name}: Benchmarking cookbook`).join('\n');
    const recipesList = availableRecipes.map(name => `- ${name}: Benchmarking recipe`).join('\n');
    const datasetsList = availableDatasets.map(name => `- ${name}: Benchmarking dataset`).join('\n');
    const attackModulesList = availableAttackModules.map(name => `- ${name}: Attack module`).join('\n');

    return `You are an AI testing expert helping developers test their LLM applications using AI Verify Moonshot framework.

Your task is to analyze natural language queries from developers and extract structured testing intent.

You can analyze entire project folders to discover prompts, datasets, models, and automatically recommend appropriate tests.

IMPORTANT: You must ONLY suggest from the actual available resources listed below. Do NOT suggest any cookbooks, recipes, datasets, or attack modules that are not in these lists.

AVAILABLE COOKBOOKS (from revised-moonshot-data/cookbooks):
${cookbooksList}

AVAILABLE RECIPES (from revised-moonshot-data/recipes):
${recipesList}

AVAILABLE DATASETS (from revised-moonshot-data/datasets):
${datasetsList}

AVAILABLE ATTACK MODULES (from revised-moonshot-data/attack-modules):
${attackModulesList}

METRICS:
- toxicity-classifier: Detect harmful content
- genderbias_metric: Gender bias detection
- faithfulness: Hallucination detection
- bertscore: Semantic similarity
- exactstrmatch: Exact match accuracy
- refusal: Appropriate refusal detection
- cybersecevalannotator: Security evaluation
- answerrelevance: Response relevance scoring

Analyze the user's query and return a JSON object with:
1. focus_areas: Main testing concerns (bias, toxicity, safety, security, hallucination, performance, etc.)
2. test_types: Array of testing types needed - can include multiple: ["benchmark"], ["redteam"], or ["benchmark", "redteam"]. Use "benchmark" for accuracy/performance testing, "redteam" for security/safety testing.
3. specific_concerns: Specific requirements or concerns mentioned
4. models_mentioned: Any specific models or endpoints mentioned
5. suggested_cookbooks: Most relevant cookbooks for this query (ONLY from the available cookbooks, recipes, or datasets list above)
6. suggested_redteam: Most relevant attack modules for this query (ONLY from the available attack modules list above)
7. suggested_metrics: Most relevant metrics to evaluate
8. confidence: Your confidence in the interpretation (0-1)
9. is_project_query: True if the query mentions analyzing a project folder/path
10. project_path: If mentioned, the path to the project folder

If the user mentions a project path or folder (e.g., "analyze /path/to/my/project" or "test my project at ./my-app"), set is_project_query to true and extract the path.

Be specific and actionable in your suggestions.`;
  }

  async parseTestingIntent(query: string): Promise<TestingIntent> {
    // Build system prompt dynamically with current available resources
    const systemPrompt = await this.buildSystemPrompt();
    
    const prompt = `${systemPrompt}

Analyze this testing request and extract structured intent:

"${query}"

Respond with a JSON object following the schema described above.`;

    try {
      const intent = await this.callLLM(prompt);
      console.log(`[DEBUG] Raw LLM response:`, intent);
      
      // Clean the response - remove markdown code blocks and other formatting
      let cleanedIntent = intent
        .replace(/```json\s*/g, '')  // Remove opening ```json
        .replace(/```\s*/g, '')      // Remove closing ```
        .replace(/^[\s\n]*{/, '{')   // Remove leading whitespace before {
        .replace(/}[\s\n]*$/, '}')   // Remove trailing whitespace after }
        .trim();
      
      console.log(`[DEBUG] Cleaned JSON:`, cleanedIntent);
      
      // Parse and validate the response
      const parsed = JSON.parse(cleanedIntent);
      console.log(`[DEBUG] Parsed JSON:`, parsed);
      
      let result = TestingIntentSchema.parse({
        original_query: query,
        ...parsed,
      });
      
      // If this is a project query, analyze the project using LLM
      if (result.is_project_query && result.project_path) {
        console.log(`[DEBUG] Analyzing project at: ${result.project_path} using LLM`);
        const llmAnalysis = await this.llmProjectAnalyzer.analyzeProject(result.project_path);
        result = await this.enhanceIntentWithLLMAnalysis(result, llmAnalysis);
      }
      
      console.log(`[DEBUG] Final validated result:`, result);
      return result;
    } catch (error: any) {
      // Log detailed error information
      console.error('[QUERY-PROCESSOR] LLM parsing failed, using fallback approach');
      console.error('[QUERY-PROCESSOR] Error details:', error.message);
      console.error('[QUERY-PROCESSOR] LLM provider:', this.config.provider);
      console.error('[QUERY-PROCESSOR] LLM model:', this.config.model);
      if (error.response?.data) {
        console.error('[QUERY-PROCESSOR] API Error Response:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('[QUERY-PROCESSOR] Switching to keyword-based fallback parsing...');
      return await this.fallbackParsing(query);
    }
  }

  async callLLM(prompt: string): Promise<string> {
    if (this.config.provider === 'anthropic') {
      return this.callAnthropic(prompt);
    } else if (this.config.provider === 'openai') {
      return this.callOpenAI(prompt);
    } else if (this.config.provider === 'vertex-ai') {
      return this.callVertexAI(prompt);
    } else {
      return this.callLocalLLM(prompt);
    }
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.config.model,
        max_tokens: 1000,
        temperature: this.config.temperature,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'x-api-key': this.config.api_key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    return response.data.content[0].text;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.config.model || 'gpt-4',
        temperature: this.config.temperature,
        messages: [
          {
            role: 'system',
            content: this.systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.api_key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
  }

  private async callLocalLLM(prompt: string): Promise<string> {
    // For local LLMs (e.g., through Ollama or similar)
    const baseUrl = this.config.base_url || 'http://localhost:11434';
    
    const response = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model: this.config.model || 'llama2',
        prompt: `${this.systemPrompt}\n\n${prompt}`,
        temperature: this.config.temperature,
        format: 'json',
      }
    );

    return response.data.response;
  }

  private async callVertexAI(prompt: string): Promise<string> {
    const projectId = this.config.gcp_project_id;
    const region = this.config.gcp_region || 'us-central1';
    
    if (!projectId) {
      throw new Error('GCP_PROJECT_ID is required for Vertex AI');
    }

    console.log(`[DEBUG] Calling Vertex AI: project=${projectId}, region=${region}, model=${this.config.model}`);

    // Initialize Google Auth - use ADC if no key file specified
    const authConfig: any = {
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    };
    
    if (this.config.gcp_service_account_key_path) {
      authConfig.keyFilename = this.config.gcp_service_account_key_path;
    }
    
    const auth = new GoogleAuth(authConfig);
    const authClient = await auth.getClient();
    
    // Get access token
    const accessTokenResponse = await authClient.getAccessToken();
    const accessToken = accessTokenResponse.token;

    if (!accessToken) {
      throw new Error('Failed to get access token from Google Auth');
    }

    // Determine if this is a Claude model or Google model
    const isClaudeModel = this.config.model.includes('claude');
    const isGoogleModel = this.config.model.includes('google/') || this.config.model.includes('gemini');

    let endpoint: string;
    let requestBody: any;

    if (isClaudeModel) {
      // Claude via Vertex AI (Anthropic publisher)
      endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/anthropic/models/${this.config.model}:rawPredict`;
      requestBody = {
        anthropic_version: "vertex-2023-10-16",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        system: this.systemPrompt,
        max_tokens: 1000,
        temperature: this.config.temperature
      };
    } else if (isGoogleModel) {
      // Google models (Gemini, etc.)
      const modelName = this.config.model.replace('google/', '');
      endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${modelName}:generateContent`;
      
      requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${this.systemPrompt}\n\nUser: ${prompt}\n\nPlease respond with a JSON object as requested.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: 1000,
        }
      };
    } else {
      throw new Error(`Unsupported model for Vertex AI: ${this.config.model}`);
    }

    console.log(`[DEBUG] Vertex AI endpoint: ${endpoint}`);
    console.log(`[DEBUG] Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[DEBUG] Vertex AI response:`, response.data);

    // Extract content from the response based on model type
    if (isClaudeModel) {
      if (response.data && response.data.content && response.data.content[0]) {
        return response.data.content[0].text;
      }
    } else if (isGoogleModel) {
      if (response.data && response.data.candidates && response.data.candidates[0]) {
        const candidate = response.data.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
          return candidate.content.parts[0].text;
        }
      }
    }

    return 'No response received';
  }

  private async fallbackParsing(query: string): Promise<TestingIntent> {
    console.log(`[QUERY-PROCESSOR] Starting fallback keyword-based parsing for: "${query}"`);
    
    // Basic keyword-based fallback
    const queryLower = query.toLowerCase();
    const focusAreas: string[] = [];
    const suggestedCookbooks: string[] = [];
    const suggestedRedteam: string[] = [];
    const suggestedMetrics: string[] = [];

    // Enhanced keyword matching for better focus area detection
    if (queryLower.includes('bias') || queryLower.includes('fair')) {
      focusAreas.push('bias');
      suggestedCookbooks.push('bbq-lite');
      suggestedRedteam.push('homoglyph_attack', 'textfooler_attack');
      suggestedMetrics.push('genderbias_metric');
    }
    
    if (queryLower.includes('toxic') || queryLower.includes('harmful') || queryLower.includes('offensive')) {
      focusAreas.push('toxicity');
      suggestedCookbooks.push('challenging-toxicity-prompts');
      suggestedRedteam.push('toxic_sentence_generator', 'charswap_attack');
      suggestedMetrics.push('toxicity-classifier');
    }
    
    if (queryLower.includes('hallucin') || queryLower.includes('factual') || queryLower.includes('truthful') || queryLower.includes('accurate')) {
      focusAreas.push('hallucination');
      suggestedCookbooks.push('truthfulqa');
      suggestedRedteam.push('malicious_question_generator');
      suggestedMetrics.push('faithfulness');
    }
    
    if (queryLower.includes('safety') || queryLower.includes('safe')) {
      focusAreas.push('safety');
      suggestedCookbooks.push('mlc-ai-safety', 'common-risk-easy');
      suggestedRedteam.push('toxic_sentence_generator', 'violent_durian');
      suggestedMetrics.push('refusal');
    }
    
    if (queryLower.includes('security') || queryLower.includes('injection') || queryLower.includes('attack') || queryLower.includes('jailbreak')) {
      focusAreas.push('security');
      suggestedCookbooks.push('cyberseceval-cookbook');
      suggestedRedteam.push('malicious_question_generator', 'payload_mask_attack', 'textbugger_attack');
      suggestedMetrics.push('cybersecevalannotator');
    }
    
    if (queryLower.includes('medical') || queryLower.includes('health') || queryLower.includes('clinical')) {
      focusAreas.push('medical');
      suggestedCookbooks.push('medical-llm-leaderboard');
      suggestedMetrics.push('exactstrmatch');
    }
    
    if (queryLower.includes('singapore') || queryLower.includes('sg') || queryLower.includes('local context')) {
      focusAreas.push('singapore');
      suggestedCookbooks.push('singapore-context');
      suggestedMetrics.push('answerrelevance');
    }
    
    if (queryLower.includes('performance') || queryLower.includes('benchmark') || queryLower.includes('mmlu')) {
      focusAreas.push('performance');
      suggestedCookbooks.push('mmlu-all');
      suggestedMetrics.push('exactstrmatch', 'bertscore');
    }
    
    // Get cookbooks dynamically based on their actual tags and descriptions
    const matchingCookbooks = await this.findMatchingCookbooks(queryLower);
    
    if (matchingCookbooks.length > 0) {
      matchingCookbooks.forEach(cookbook => {
        if (!suggestedCookbooks.includes(cookbook.name)) {
          suggestedCookbooks.push(cookbook.name);
          focusAreas.push(...cookbook.matchedAreas);
        }
      });
      suggestedMetrics.push('bertscore', 'exactstrmatch');
    } else {
      // Default fallback
      focusAreas.push('comprehensive');
      suggestedCookbooks.push('common-risk-easy');
      suggestedMetrics.push('bertscore', 'exactstrmatch');
    }

    // Determine test types based on focus areas and keywords
    const testTypes: string[] = [];
    
    // Check for benchmark-oriented focus areas
    const benchmarkAreas = ['hallucination', 'factual', 'accurate', 'performance', 'singapore', 'medical', 'mmlu'];
    if (focusAreas.some(area => benchmarkAreas.some(benchmarkArea => area.toLowerCase().includes(benchmarkArea))) || 
        queryLower.includes('benchmark') || queryLower.includes('performance') || queryLower.includes('accuracy')) {
      testTypes.push('benchmark');
    }
    
    // Check for red team-oriented focus areas
    const redteamAreas = ['security', 'safety', 'toxic', 'bias', 'privacy', 'disclosure', 'attack', 'jailbreak'];
    if (focusAreas.some(area => redteamAreas.some(redteamArea => area.toLowerCase().includes(redteamArea))) || 
        queryLower.includes('red team') || queryLower.includes('attack') || queryLower.includes('security') || 
        queryLower.includes('safety') || queryLower.includes('privacy')) {
      testTypes.push('redteam');
    }
    
    // Default to benchmark if no specific test type detected
    if (testTypes.length === 0) {
      testTypes.push('benchmark');
    }

    // Remove duplicates
    const uniqueFocusAreas = [...new Set(focusAreas)];
    const uniqueCookbooks = [...new Set(suggestedCookbooks)];
    const uniqueRedteam = [...new Set(suggestedRedteam)];
    const uniqueMetrics = [...new Set(suggestedMetrics)];

    console.log(`[QUERY-PROCESSOR] Fallback parsing results:`);
    console.log(`[QUERY-PROCESSOR] - Focus areas: ${uniqueFocusAreas.join(', ')}`);
    console.log(`[QUERY-PROCESSOR] - Suggested cookbooks: ${uniqueCookbooks.join(', ')}`);
    console.log(`[QUERY-PROCESSOR] - Suggested redteam: ${uniqueRedteam.join(', ')}`);
    console.log(`[QUERY-PROCESSOR] - Test types: ${testTypes.join(', ')}`);

    return {
      original_query: query,
      focus_areas: uniqueFocusAreas,
      test_types: testTypes,
      specific_concerns: [],
      models_mentioned: [],
      confidence: 0.5,
      suggested_cookbooks: uniqueCookbooks,
      suggested_redteam: uniqueRedteam,
      suggested_metrics: uniqueMetrics,
      is_project_query: false,
    };
  }

  // Generate natural language summary of results
  async generateResultsSummary(results: any): Promise<string> {
    const prompt = `Analyze these LLM test results and provide a concise, actionable summary for a developer:

Results:
${JSON.stringify(results, null, 2)}

Provide:
1. Overall assessment (1-2 sentences)
2. Key strengths (bullet points)
3. Critical issues to address (bullet points)
4. Recommended next steps

Keep it concise and developer-friendly.`;

    try {
      return await this.callLLM(prompt);
    } catch (error) {
      // Fallback summary
      return this.generateFallbackSummary(results);
    }
  }

  private generateFallbackSummary(results: any): string {
    const summary = [];
    
    const overallScore = results.overall_score || 0;
    if (overallScore >= 0.8) {
      summary.push('✅ Excellent performance across tested dimensions.');
    } else if (overallScore >= 0.6) {
      summary.push('⚠️ Good performance with areas for improvement.');
    } else {
      summary.push('❌ Significant improvements needed.');
    }
    
    if (results.key_findings) {
      summary.push('\nKey Findings:');
      results.key_findings.forEach((finding: string) => {
        summary.push(`• ${finding}`);
      });
    }
    
    return summary.join('\n');
  }

  // Enhanced intent with LLM project analysis
  private async enhanceIntentWithLLMAnalysis(intent: TestingIntent, llmAnalysis: LLMProjectAnalysis): Promise<TestingIntent> {
    console.log(`[DEBUG] Enhancing intent with LLM project analysis`);
    
    const enhancedIntent = { ...intent };
    
    // Add LLM analysis to result
    enhancedIntent.project_analysis = llmAnalysis;
    
    // Use LLM recommendations directly
    enhancedIntent.focus_areas = Array.from(new Set([
      ...enhancedIntent.focus_areas,
      ...llmAnalysis.priority_test_areas
    ]));
    
    // Use LLM-recommended tests
    enhancedIntent.suggested_cookbooks = Array.from(new Set([
      ...enhancedIntent.suggested_cookbooks,
      ...llmAnalysis.recommended_benchmarking_options
    ]));
    
    // Update confidence with LLM analysis confidence
    enhancedIntent.confidence = Math.max(enhancedIntent.confidence, llmAnalysis.confidence_score);
    
    // Add security concerns as specific concerns
    if (llmAnalysis.security_concerns.length > 0) {
      enhancedIntent.specific_concerns = [
        ...enhancedIntent.specific_concerns,
        ...llmAnalysis.security_concerns.map(concern => `Security: ${concern}`)
      ];
    }
    
    // Add data sensitivity warning if high
    if (llmAnalysis.data_sensitivity_level === 'high' || llmAnalysis.data_sensitivity_level === 'critical') {
      enhancedIntent.specific_concerns.push(`High data sensitivity detected (${llmAnalysis.data_sensitivity_level}) - additional privacy tests recommended`);
    }
    
    return enhancedIntent;
  }

  // Generate LLM project testing plan
  async generateLLMProjectTestingPlan(llmAnalysis: LLMProjectAnalysis, userQuery: string): Promise<string> {
    const analysisFormat = this.llmProjectAnalyzer.generateAnalysisSummary(llmAnalysis);
    
    const prompt = `Based on this LLM project analysis, create a comprehensive testing execution plan:

${analysisFormat}

User Query: "${userQuery}"

Create a detailed testing plan that:
1. Prioritizes the most critical tests based on the project characteristics
2. Explains WHY each test is recommended for this specific project
3. Provides a logical testing sequence 
4. Includes setup requirements and expected outcomes
5. Focuses on the identified risk areas and domains

Format as a clear, actionable plan with specific Moonshot cookbook names.`;

    return await this.callLLM(prompt);
  }

  // Interpret user feedback to refine testing
  async interpretFeedback(feedback: string, previousContext: any): Promise<any> {
    const prompt = `The user provided feedback on test results. Interpret their needs:

Previous test context:
${JSON.stringify(previousContext, null, 2)}

User feedback:
"${feedback}"

Determine:
1. satisfaction_level: (satisfied/needs_changes/dissatisfied)
2. requested_changes: What specific changes they want
3. additional_tests: Any additional tests to run
4. focus_shift: Any change in testing focus

Respond with JSON.`;

    try {
      const interpretation = await this.callLLM(prompt);
      return JSON.parse(interpretation);
    } catch (error) {
      return {
        satisfaction_level: 'needs_changes',
        requested_changes: ['Unable to parse feedback'],
        additional_tests: [],
        focus_shift: null,
      };
    }
  }

  private async findMatchingCookbooks(queryLower: string): Promise<Array<{name: string, matchedAreas: string[]}>> {
    try {
      const baseDataPath = path.resolve(process.cwd(), '../revised-moonshot-data');
      const cookbooksDir = path.join(baseDataPath, 'cookbooks');
      const files = await fs.readdir(cookbooksDir);
      
      const matchingCookbooks = [];
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const cookbookPath = path.join(cookbooksDir, file);
          const cookbookData = JSON.parse(await fs.readFile(cookbookPath, 'utf-8'));
          const cookbookName = file.replace('.json', '');
          const matchedAreas = [];
          
          // Check tags
          if (cookbookData.tags) {
            for (const tag of cookbookData.tags) {
              const tagLower = tag.toLowerCase();
              if (queryLower.includes(tagLower) || 
                  (tagLower.includes('toxicity') && queryLower.includes('toxic')) ||
                  (tagLower.includes('bias') && queryLower.includes('bias')) ||
                  (tagLower.includes('jailbreak') && queryLower.includes('security')) ||
                  (tagLower.includes('truthful') && queryLower.includes('hallucinat'))) {
                matchedAreas.push(tagLower);
              }
            }
          }
          
          // Check categories
          if (cookbookData.categories) {
            for (const category of cookbookData.categories) {
              const categoryLower = category.toLowerCase();
              if (queryLower.includes(categoryLower) || 
                  (categoryLower.includes('safety') && (queryLower.includes('toxic') || queryLower.includes('harm'))) ||
                  (categoryLower.includes('capability') && queryLower.includes('performance'))) {
                matchedAreas.push(categoryLower);
              }
            }
          }
          
          // Check description
          if (cookbookData.description) {
            const descLower = cookbookData.description.toLowerCase();
            if (queryLower.includes('singapore') && descLower.includes('singapore')) {
              matchedAreas.push('singapore');
            }
            if (queryLower.includes('medical') && descLower.includes('medical')) {
              matchedAreas.push('medical');
            }
            if (queryLower.includes('chinese') && descLower.includes('chinese')) {
              matchedAreas.push('chinese');
            }
          }
          
          // Check cookbook name for direct matches
          const nameLower = cookbookName.toLowerCase();
          if (queryLower.includes('cybersec') && nameLower.includes('cybersec')) {
            matchedAreas.push('security');
          }
          if (queryLower.includes('leaderboard') && nameLower.includes('leaderboard')) {
            matchedAreas.push('capability');
          }
          
          if (matchedAreas.length > 0) {
            matchingCookbooks.push({
              name: cookbookName,
              matchedAreas: [...new Set(matchedAreas)] // Remove duplicates
            });
          }
          
        } catch (error) {
          console.error(`Error reading cookbook ${file}:`, error);
          continue;
        }
      }
      
      // Sort by relevance (number of matched areas)
      return matchingCookbooks.sort((a, b) => b.matchedAreas.length - a.matchedAreas.length).slice(0, 3);
      
    } catch (error) {
      console.error('Error finding matching cookbooks:', error);
      return [];
    }
  }
}