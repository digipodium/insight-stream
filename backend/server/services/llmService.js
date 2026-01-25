const { GoogleGenerativeAI } = require('@google/generative-ai');

// Simple in-memory cache with TTL
class SimpleCache {
  constructor(ttlSeconds = 300) { // Default 5 minutes
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const item = this.cache.get(key);
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl
    });
  }

  clear() {
    this.cache.clear();
  }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class LLMService {
  constructor() {
    // Optimization: Limit output tokens to reduce cost/usage
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        maxOutputTokens: 1024, // Limit response size
        temperature: 0.7,
      }
    });
    this.cache = new SimpleCache(600); // 10 minutes cache
  }

  /**
   * Local regex-based command parser.
   * Returns null if it cannot confidently parse the command, signaling "Ask AI".
   */
  parseCommandLocal(command) {
    const lowerCommand = command.toLowerCase().trim();

    // 1. Clean/Cleanup
    if (lowerCommand.includes('clean') || lowerCommand.includes('cleanup')) {
      return {
        operation: 'clean',
        parameters: {},
        explanation: 'Standardizing formats, removing duplicates, and handling missing values (Local Rule).'
      };
    }

    // 2. Remove Duplicates
    if (lowerCommand.includes('duplicate') || lowerCommand.includes('remove duplicate')) {
      return {
        operation: 'remove_duplicates',
        parameters: {},
        explanation: 'Removing duplicate rows (Local Rule).'
      };
    }

    // 3. Handle Missing
    if (lowerCommand.includes('fill') && (lowerCommand.includes('missing') || lowerCommand.includes('null'))) {
      return {
        operation: 'fill_missing',
        parameters: {},
        explanation: 'Filling missing values with defaults (Local Rule).'
      };
    }

    // 4. Remove Outliers
    if (lowerCommand.includes('remove') && lowerCommand.includes('outlier')) {
      return {
        operation: 'remove_outliers',
        parameters: {},
        explanation: 'Removing statistical outliers using IQR (Local Rule).'
      };
    }

    // 5. Standardize
    if (lowerCommand.includes('standardize') || lowerCommand.includes('format')) {
      return {
        operation: 'standardize',
        parameters: {},
        explanation: 'Standardizing text formats (Local Rule).'
      };
    }

    // 6. Simple Filter: "remove rows where age > 25"
    if ((lowerCommand.includes('remove') || lowerCommand.includes('delete')) &&
      (lowerCommand.includes('row') || lowerCommand.includes('where'))) {

      // Attempt to parse simple "column operator value" patterns
      // We will only handle the most obvious cases locally to avoid errors.
      // Complex cases will fall through to null -> AI.

      // Pattern: column > value
      const simplePattern = /(\w+)\s+(>|<|=|==|!=|>=|<=)\s+(\d+)/;
      const match = lowerCommand.match(simplePattern);

      if (match) {
        const [_, col, op, val] = match;
        // Map symbol to operator string if needed, or backend can handle symbols
        const opMap = { '>': 'gt', '<': 'lt', '=': 'eq', '==': 'eq', '!=': 'ne', '>=': 'gte', '<=': 'lte' };

        return {
          operation: 'filter_rows',
          parameters: {
            conditions: [{
              column: col,
              operator: opMap[op] || op,
              value: Number(val),
              valueType: 'number'
            }],
            logic: 'AND'
          },
          explanation: `Locally parsed: Filter ${col} ${op} ${val}`
        };
      }
    }

    // If no specific rule matched, return null to let AI handle it
    return null;
  }

  // Helper to generate cache keys
  _getCacheKey(prefix, ...args) {
    return `${prefix}:${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(':')}`;
  }

  /**
   * Process natural language data commands with Local-First strategy
   */
  async processDataCommand(command, dataContext) {
    try {
      console.log(`[LLM] Processing command: "${command}"`);

      // 1. IMPROVEMENT: Try Local Parsing First
      // This saves an API call for common operations
      const localResult = this.parseCommandLocal(command);
      if (localResult) {
        console.log('[LLM] ⚡ Used Local Parser (No API Cost)');
        return {
          success: true,
          command: {
            type: 'operation', // Ensure consistency with AI response structure
            ...localResult
          },
          usedFallback: false,
          source: 'local'
        };
      }

      // 2. IMPROVEMENT: Check Cache
      // If we've seen this exact command for this dataset structure/size recently
      const cacheKey = this._getCacheKey('cmd', command, dataContext.columns, dataContext.rowCount);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log('[LLM] 📦 Used Cached AI Response');
        return cached;
      }

      // 3. Call AI (Only if necessary)
      console.log('[LLM] 🤖 Calling Gemini API...');
      const prompt = `
You are a data processing assistant. Analyze the user's command and determine the best way to execute it.

Dataset Information:
- Available Columns: ${dataContext.columns.join(', ')}
- Total Rows: ${dataContext.rowCount}
- Column Types: ${JSON.stringify(dataContext.columnTypes, null, 2)}

User Command: "${command}"

Respones Types:
1. "operation": for standard tools (remove_rows, remove_duplicates, fill_missing, remove_outliers, standardize, clean, analyze)
2. "code": custom JS code using "data" array.
3. "chain": list of operations.

Response Format (JSON ONLY):
{
  "type": "operation" | "code" | "chain",
  "operation": "tool_name", 
  "parameters": { ... },
  "explanation": "concise description"
}

Standard Operations:
- "remove_rows": DELETE rows that match the condition. (e.g. to keep males, remove females).
  Parameters: { "conditions": [...], "logic": "AND"|"OR" }
- "remove_duplicates": Remove duplicate rows
- "fill_missing": Fill missing values
- "remove_outliers": Remove statistical outliers (IQR method)
- "standardize": Standardize text formats
- "clean": Full cleaning pipeline
- "analyze": Show statistics

**Type: "code"** - For custom transformations:
{
  "type": "code",
  "code": "JavaScript code that transforms the data",
  "description": "what the code does",
  "explanation": "..."
}

Code Requirements:
- The code will receive: data (array of objects), headers (array of strings)
- The code must return: { data: [...], headers: [...], changes: {...} }
- Use standard JavaScript: map, filter, reduce, etc.
- Access columns as: row.columnName
- Example: "data.map(row => ({ ...row, fullName: row.firstName + ' ' + row.lastName }))"

**Type: "chain"** - For multi-step operations:
{
  "type": "chain",
  "steps": [
    { "type": "operation"|"code", ... },
    { "type": "operation"|"code", ... }
  ],
  "explanation": "..."
}

IMPORTANT Rules:
1. Match column names from available columns EXACTLY (case-sensitive)
2. Handle variations: "customer's age" → find "age" or "customerAge" in columns
3. For remove_rows/filter: Use operators: gt, lt, eq, ne, gte, lte, in, not_in, contains, odd, even, date_after, date_before
4. To "Keep Only X": use remove_rows with condition "NOT X" (e.g. keep males -> remove gender != male)
5. If unsure, prefer "code" type for flexibility
6. For complex operations, use "chain" type

Examples:

Command: "remove rows where age > 25"
Response: {"type": "operation", "operation": "remove_rows", "parameters": {"conditions": [{"column": "age", "operator": "gt", "value": 25, "valueType": "number"}], "logic": "AND"}, "explanation": "Remove rows where age > 25"}

Command: "keep only male customers"
Response: {"type": "operation", "operation": "remove_rows", "parameters": {"conditions": [{"column": "gender", "operator": "ne", "value": "male", "valueType": "string"}], "logic": "AND"}, "explanation": "Remove rows where gender is not male"}

Command: "group sales by region and calculate total"
Response: {"type": "code", "code": "const grouped = data.reduce((acc, row) => { const region = row.region || 'Unknown'; acc[region] = (acc[region] || 0) + (Number(row.sales) || 0); return acc; }, {}); const result = Object.entries(grouped).map(([region, total]) => ({ region, totalSales: total })); return { data: result, headers: ['region', 'totalSales'], changes: { grouped: Object.keys(grouped).length } };", "description": "Group by region and sum sales", "explanation": "Grouping sales data by region and calculating totals"}
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.type) parsed.type = 'operation';

        const output = {
          success: true,
          command: parsed,
          usedFallback: false,
          source: 'ai'
        };

        // Save to cache
        this.cache.set(cacheKey, output);
        return output;
      }

      throw new Error("Failed to parse AI response JSON");

    } catch (error) {
      console.error('❌ AI Command Processing Error:', error.message);

      // Fallback: If AI fails (Rate limit etc), try to force a simple analysis
      return {
        success: true,
        command: {
          operation: 'analyze',
          parameters: {},
          explanation: 'Could not understand command (AI Error). Showing analysis.'
        },
        usedFallback: true
      };
    }
  }

  /**
   * Explain data cleaning operations with fallback
   */
  async explainDataCleaning(operations) {
    try {
      const prompt = `
You are a data analysis assistant. Explain the following data cleaning operations in simple, clear language.

Operations performed:
${JSON.stringify(operations, null, 2)}

Provide:
1. A brief summary of what was done
2. Why each operation was necessary
3. The impact on the data quality

Keep the explanation concise and easy to understand for non-technical users.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      return {
        success: true,
        explanation: response.text(),
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ AI Explanation Error:', error.message);
      console.log('✅ Using fallback explanation generator');

      // Generate simple explanation without AI
      return {
        success: true,
        explanation: this.generateFallbackExplanation(operations),
        usedFallback: true
      };
    }
  }

  /**
   * Generate simple explanation without AI
   */
  generateFallbackExplanation(operations) {
    let explanation = "Here's what was done to your data:\n\n";

    operations.forEach((op, index) => {
      switch (op.type) {
        case 'remove_duplicates':
          explanation += `${index + 1}. **Removed Duplicates**: Found and removed ${op.details.removed} duplicate rows. This ensures each record is unique and prevents data redundancy.\n\n`;
          break;

        case 'handle_missing':
          explanation += `${index + 1}. **Handled Missing Values**: Removed ${op.details.rowsRemoved} rows with missing data. This improves data quality by eliminating incomplete records.\n\n`;
          break;

        case 'fill_missing':
          explanation += `${index + 1}. **Filled Missing Values**: Filled ${op.details.valuesFilled} missing values in columns: ${op.details.columnsAffected.join(', ')}. Used statistical methods (mean for numbers, mode for categories).\n\n`;
          break;

        case 'standardize_formats':
          explanation += `${index + 1}. **Standardized Formats**: Cleaned up text formatting in ${op.details.columnsAffected.length} columns. Removed extra spaces and standardized text case.\n\n`;
          break;

        case 'remove_outliers':
          explanation += `${index + 1}. **Removed Outliers**: Removed ${op.details.outliersRemoved} statistical outliers from columns: ${op.details.affectedColumns.join(', ')}. This prevents extreme values from skewing analysis.\n\n`;
          break;

        case 'filter_rows':
          const conditions = op.details.conditions || [];
          const conditionDesc = conditions.map(c => {
            let desc = `${c.column} `;
            switch (c.operator) {
              case 'gt': desc += `> ${c.value}`; break;
              case 'lt': desc += `< ${c.value}`; break;
              case 'eq': desc += `= ${c.value}`; break;
              case 'ne': desc += `≠ ${c.value}`; break;
              case 'gte': desc += `≥ ${c.value}`; break;
              case 'lte': desc += `≤ ${c.value}`; break;
              case 'in': desc += `in [${Array.isArray(c.value) ? c.value.join(', ') : c.value}]`; break;
              case 'not_in': desc += `not in [${Array.isArray(c.value) ? c.value.join(', ') : c.value}]`; break;
              case 'contains': desc += `contains "${c.value}"`; break;
              case 'not_contains': desc += `does not contain "${c.value}"`; break;
              case 'odd': desc += `is odd`; break;
              case 'even': desc += `is even`; break;
              case 'date_after': desc += `> ${c.value}`; break;
              case 'date_before': desc += `< ${c.value}`; break;
              default: desc += `${c.operator} ${c.value}`;
            }
            return desc;
          }).join(', ');
          explanation += `${index + 1}. **Filtered Rows**: Removed ${op.details.rowsRemoved} rows (from ${op.details.originalCount} total) matching conditions: ${conditionDesc}.\n\n`;
          break;
      }
    });

    explanation += "**Impact**: Your data is now cleaner, more consistent, and ready for analysis!";

    return explanation;
  }

  /**
   * Generate insights with fallback
   */
  /**
   * Generate insights with Caching & Optimized Prompt
   */
  async generateInsights(statistics, sampleData) {
    try {
      // 1. IMPROVEMENT: Check Cache
      const cacheKey = this._getCacheKey('insights', statistics);
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      const prompt = `
You are a data analyst. Analyze these statistics and provide actionable insights.

Stats:
${JSON.stringify(statistics)}

Sample:
${JSON.stringify(sampleData)}

Provide concise insights:
1. Findings
2. Patterns
3. Data Quality
4. Recommendations

Keep it brief and practical.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const output = {
        success: true,
        insights: response.text(),
        usedFallback: false
      };

      // Save to cache
      this.cache.set(cacheKey, output);
      return output;

    } catch (error) {
      console.error('❌ AI Insights Error:', error.message);

      return {
        success: true,
        insights: this.generateFallbackInsights(statistics),
        usedFallback: true
      };
    }
  }

  /**
   * Generate basic insights without AI
   */
  generateFallbackInsights(statistics) {
    let insights = "**Dataset Overview:**\n\n";

    const columns = Object.keys(statistics);
    const numericColumns = columns.filter(col => statistics[col].type === 'number');
    const categoricalColumns = columns.filter(col => statistics[col].type === 'categorical');

    insights += `- Total columns: ${columns.length}\n`;
    insights += `- Numeric columns: ${numericColumns.length}\n`;
    insights += `- Categorical columns: ${categoricalColumns.length}\n\n`;

    insights += "**Key Findings:**\n\n";

    // Analyze numeric columns
    if (numericColumns.length > 0) {
      insights += `1. **Numeric Data**: Found ${numericColumns.length} numeric columns:\n`;
      numericColumns.slice(0, 3).forEach(col => {
        const stats = statistics[col];
        insights += `   - ${col}: Range ${stats.min} to ${stats.max}, Average: ${stats.mean}\n`;
      });
      insights += "\n";
    }

    // Analyze categorical columns
    if (categoricalColumns.length > 0) {
      insights += `2. **Categorical Data**: Found ${categoricalColumns.length} categorical columns:\n`;
      categoricalColumns.slice(0, 3).forEach(col => {
        const stats = statistics[col];
        insights += `   - ${col}: ${stats.uniqueValues} unique values\n`;
      });
      insights += "\n";
    }

    // Check for missing data
    const columnsWithMissing = columns.filter(col => statistics[col].missing > 0);
    if (columnsWithMissing.length > 0) {
      insights += `3. **Data Quality**: ${columnsWithMissing.length} columns have missing values:\n`;
      columnsWithMissing.slice(0, 3).forEach(col => {
        insights += `   - ${col}: ${statistics[col].missing} missing values\n`;
      });
      insights += "\n";
    }

    insights += "**Recommendations:**\n";
    insights += "- Consider filling or removing missing values\n";
    insights += "- Look for patterns in numeric data distributions\n";
    insights += "- Explore relationships between categorical and numeric variables\n";

    return insights;
  }

  /**
   * Answer questions about the dataset
   */
  /**
   * Answer questions about the dataset with Caffeine & Optimization
   */
  async answerDatasetQuestion(question, dataContext) {
    try {
      const cacheKey = this._getCacheKey('qa', question, dataContext.columns.length);
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      const prompt = `
Data Analysis Helper.
Columns: ${dataContext.columns.join(', ')}
Stats: ${JSON.stringify(dataContext.statistics)}
Sample: ${JSON.stringify(dataContext.sampleData)}

Question: "${question}"

Answer concisely based on the data.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      const output = {
        success: true,
        answer: response.text(),
        usedFallback: false
      };

      this.cache.set(cacheKey, output);
      return output;

    } catch (error) {
      console.error('❌ AI Q&A Error:', error.message);

      return {
        success: true,
        answer: this.generateFallbackAnswer(question, dataContext),
        usedFallback: true
      };
    }
  }

  /**
   * Generate basic answer without AI
   */
  generateFallbackAnswer(question, dataContext) {
    const lowerQuestion = question.toLowerCase();

    // How many rows/records?
    if (lowerQuestion.includes('how many') && (lowerQuestion.includes('row') || lowerQuestion.includes('record'))) {
      return `Your dataset contains **${dataContext.rowCount} rows**.`;
    }

    // How many columns?
    if (lowerQuestion.includes('how many') && lowerQuestion.includes('column')) {
      return `Your dataset has **${dataContext.columns.length} columns**: ${dataContext.columns.join(', ')}.`;
    }

    // What columns?
    if (lowerQuestion.includes('what') && lowerQuestion.includes('column')) {
      return `Your dataset has the following columns:\n\n${dataContext.columns.map((col, i) => `${i + 1}. **${col}** (${dataContext.columnTypes[col]})`).join('\n')}`;
    }

    // Missing values?
    if (lowerQuestion.includes('missing') || lowerQuestion.includes('null')) {
      const columnsWithMissing = Object.keys(dataContext.statistics)
        .filter(col => dataContext.statistics[col].missing > 0)
        .map(col => `- ${col}: ${dataContext.statistics[col].missing} missing values`);

      if (columnsWithMissing.length === 0) {
        return "Great news! Your dataset has **no missing values**. All cells are populated.";
      } else {
        return `Your dataset has missing values in the following columns:\n\n${columnsWithMissing.join('\n')}`;
      }
    }

    // Data types?
    if (lowerQuestion.includes('type') || lowerQuestion.includes('data type')) {
      return `Here are the data types for each column:\n\n${Object.entries(dataContext.columnTypes).map(([col, type]) => `- **${col}**: ${type}`).join('\n')}`;
    }

    // Summary/overview?
    if (lowerQuestion.includes('summary') || lowerQuestion.includes('overview') || lowerQuestion.includes('about')) {
      const numericCols = Object.keys(dataContext.columnTypes).filter(col => dataContext.columnTypes[col] === 'number').length;
      const categoricalCols = Object.keys(dataContext.columnTypes).filter(col => dataContext.columnTypes[col] === 'categorical').length;

      return `**Dataset Overview:**\n\n- Total rows: ${dataContext.rowCount}\n- Total columns: ${dataContext.columns.length}\n- Numeric columns: ${numericCols}\n- Categorical columns: ${categoricalCols}\n\nYou can ask more specific questions about the data!`;
    }

    // Default response
    return `I can help you understand your dataset! Here's what I know:\n\n- **Rows**: ${dataContext.rowCount}\n- **Columns**: ${dataContext.columns.length}\n- **Column names**: ${dataContext.columns.slice(0, 5).join(', ')}${dataContext.columns.length > 5 ? '...' : ''}\n\nTry asking:\n- "How many missing values are there?"\n- "What are the column types?"\n- "Show me a summary"\n- "What's the range of [column name]?"`;
  }

  /**
   * Simple text response (for general queries)
   */
  async getTextResponse(userPrompt) {
    try {
      const result = await this.model.generateContent(userPrompt);
      const response = await result.response;
      const text = response.text();

      return {
        success: true,
        response: text
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async chatWithContext(messages) {
    try {
      // Construct chat history
      const chat = this.model.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      });
      const lastMessage = messages[messages.length - 1].content;
      const result = await chat.sendMessage(lastMessage);
      const response = await result.response;

      return {
        success: true,
        response: response.text()
      };
    } catch (error) {
      console.error('Chat Error:', error);
      return { success: false, response: "I'm having trouble connecting to the AI right now." };
    }
  }

  /**
   * Generate a chart configuration based on data and user request
   */
  async generateChartConfig(question, dataContext) {
    try {
      const prompt = `
You are a data visualization expert.
Dataset Columns: ${dataContext.columns.join(', ')}
Column Types: ${JSON.stringify(dataContext.columnTypes)}
Sample Data: ${JSON.stringify(dataContext.sampleData)}
User Request: "${question}"
Based on the request and data, generate a JSON configuration for a chart.
Supported types: "bar", "line", "pie", "scatter".
Rules:
1. "labels": Array of strings for the X-axis (or pie segments).
2. "datasets": Array of objects with "label" and "data" (numbers).
3. "xAxisColumn": The EXACT name of the column used for labels.
4. "yAxisColumn": The EXACT name of the column used for values.
5. If the request is vague, pick the best visualization.
6. Respond ONLY with valid JSON. Do not include markdown formatting like \`\`\`json.
        Example JSON Structure:
          {
            "type": "bar",
            "title": "Sales by Region",
            "xAxisColumn": "Region",
            "yAxisColumn": "Revenue",
            "labels": ["North", "South", "East"],
            "datasets": [
              {
                "label": "Revenue",
                "data": [12000, 9000, 15000]
              }
            ]
          }
      `;
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Clean cleanup of potential markdown
      let cleanText = text.replace(/```json /g, '').replace(/```/g, '').trim();

      // Find the first opening brace and last closing brace
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        console.error("No JSON structure found:", text);
        return null;
      }

      const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("Chart Gen Error:", error);
      return null;
    }
  }

  /**
   * Generate formula for dataset operations
   */
  async generateFormula(request, dataContext) {
    try {
      const prompt = `
You are a data formula expert. Generate a formula based on the user's request.

Dataset Columns: ${dataContext.columns.join(', ')}
Column Types: ${JSON.stringify(dataContext.columnTypes)}
Sample Data (first 3 rows): ${JSON.stringify(dataContext.sampleData.slice(0, 3))}

User Request: "${request}"

Generate a formula that can be applied to the dataset. Respond in JSON format:
{
  "formulaType": "excel" | "javascript",
  "formula": "the actual formula string",
  "newColumnName": "suggested name for the new column",
  "explanation": "detailed explanation of what the formula does",
  "example": "example calculation with sample values",
  "columnsUsed": ["array", "of", "column", "names", "used"]
}

For Excel formulas, use standard Excel syntax (e.g., =A2*B2, =IF(C2>100,"High","Low"))
For JavaScript formulas, use JavaScript expressions that can be evaluated row by row (e.g., row.price * row.quantity, row.date.getFullYear())

Respond ONLY with valid JSON. Do not include markdown formatting.
      `;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON
      let cleanText = text.replace(/```json /g, '').replace(/```/g, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('Could not parse formula response');
      }

      const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
      const formulaData = JSON.parse(jsonStr);

      // Validate required fields
      if (!formulaData.formula || !formulaData.explanation) {
        throw new Error('Invalid formula response structure');
      }

      return {
        success: true,
        formula: formulaData,
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ Formula Generation Error:', error.message);
      return {
        success: false,
        error: error.message,
        usedFallback: true
      };
    }
  }

  /**
   * Parse column manipulation request
   */
  async parseManipulationRequest(request, dataContext) {
    try {
      const prompt = `
You are a data transformation assistant. Parse the user's request to manipulate a column.

Dataset Columns: ${dataContext.columns.join(', ')}
Column Types: ${JSON.stringify(dataContext.columnTypes)}
Sample Data (first 3 rows): ${JSON.stringify(dataContext.sampleData.slice(0, 3))}

User Request: "${request}"

Determine the manipulation type and respond in JSON:
{
  "operation": "transform" | "extract" | "calculate" | "conditional" | "convert",
  "targetColumn": "exact column name from dataset",
  "newColumnName": "name for new column (if creating new), or same as targetColumn if modifying",
  "parameters": {
    // Operation-specific parameters
    // For "convert": {"toType": "number" | "string" | "date" | "uppercase" | "lowercase"}
    // For "extract": {"pattern": "year" | "month" | "day" | "first_word" | "last_word" | "regex"}
    // For "calculate": {"operation": "multiply" | "divide" | "add" | "subtract", "value": number or column name}
    // For "conditional": {"condition": "expression", "trueValue": "value", "falseValue": "value"}
    // For "transform": {"action": "description"}
  },
  "explanation": "what this manipulation will do"
}

Respond ONLY with valid JSON. Do not include markdown formatting.
      `;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON
      let cleanText = text.replace(/```json /g, '').replace(/```/g, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('Could not parse manipulation request');
      }

      const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
      const manipulationData = JSON.parse(jsonStr);

      // Validate
      if (!manipulationData.operation || !manipulationData.targetColumn) {
        throw new Error('Invalid manipulation request structure');
      }

      // Verify target column exists
      if (!dataContext.columns.includes(manipulationData.targetColumn)) {
        throw new Error(`Column "${manipulationData.targetColumn}" not found in dataset`);
      }

      return {
        success: true,
        manipulation: manipulationData,
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ Manipulation Parsing Error:', error.message);
      return {
        success: false,
        error: error.message,
        usedFallback: true
      };
    }
  }

  /**
   * Generate data validation rules
   */
  async generateValidationRules(dataContext) {
    try {
      const prompt = `
You are a data quality expert. Analyze the dataset and generate validation rules.

Dataset Columns: ${dataContext.columns.join(', ')}
Column Types: ${JSON.stringify(dataContext.columnTypes)}
Statistics: ${JSON.stringify(dataContext.statistics)}
Sample Data (first 5 rows): ${JSON.stringify(dataContext.sampleData.slice(0, 5))}

Generate validation rules in JSON format:
{
  "rules": [
    {
      "column": "column_name",
      "ruleType": "type" | "range" | "format" | "required" | "unique" | "pattern",
      "description": "what this rule checks",
      "validation": "validation expression or criteria",
      "severity": "error" | "warning"
    }
  ],
  "summary": "overall data quality assessment"
}

Respond ONLY with valid JSON. Do not include markdown formatting.
      `;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON
      let cleanText = text.replace(/```json /g, '').replace(/```/g, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('Could not parse validation rules');
      }

      const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
      const validationData = JSON.parse(jsonStr);

      return {
        success: true,
        rules: validationData,
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ Validation Rules Generation Error:', error.message);
      return {
        success: false,
        error: error.message,
        usedFallback: true
      };
    }
  }

  /**
   * Detect column relationships
   */
  async detectColumnRelationships(dataContext) {
    try {
      const prompt = `
You are a data analysis expert. Detect relationships between columns in the dataset.

Dataset Columns: ${dataContext.columns.join(', ')}
Column Types: ${JSON.stringify(dataContext.columnTypes)}
Statistics: ${JSON.stringify(dataContext.statistics)}
Sample Data (first 10 rows): ${JSON.stringify(dataContext.sampleData.slice(0, 10))}

Analyze and detect:
1. Mathematical relationships (e.g., Price × Quantity = Total)
2. Derived columns that could be calculated
3. Potential inconsistencies
4. Data dependencies

Respond in JSON format:
{
  "relationships": [
    {
      "type": "mathematical" | "derived" | "dependency" | "inconsistency",
      "columns": ["column1", "column2"],
      "relationship": "description of relationship",
      "formula": "optional formula if mathematical",
      "confidence": "high" | "medium" | "low",
      "suggestion": "what action to take"
    }
  ],
  "summary": "overall relationship analysis"
}

Respond ONLY with valid JSON. Do not include markdown formatting.
      `;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON
      let cleanText = text.replace(/```json /g, '').replace(/```/g, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('Could not parse relationships');
      }

      const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
      const relationshipsData = JSON.parse(jsonStr);

      return {
        success: true,
        relationships: relationshipsData,
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ Relationship Detection Error:', error.message);
      return {
        success: false,
        error: error.message,
        usedFallback: true
      };
    }
  }

  /**
   * Generate custom JavaScript code for data transformation
   */
  async generateTransformationCode(command, dataContext) {
    try {
      const prompt = `
You are a JavaScript code generator for data transformations. Generate safe, efficient code to transform the dataset.

Dataset Information:
- Available Columns: ${dataContext.columns.join(', ')}
- Total Rows: ${dataContext.rowCount}
- Column Types: ${JSON.stringify(dataContext.columnTypes, null, 2)}
- Sample Data (first 3 rows): ${JSON.stringify(dataContext.sampleData?.slice(0, 3) || [], null, 2)}

User Request: "${command}"

Generate JavaScript code that:
1. Receives: data (array of objects), headers (array of strings)
2. Transforms the data according to the user's request
3. Returns: { data: [...], headers: [...], changes: {...} }

Code Requirements:
- Use standard JavaScript: map, filter, reduce, forEach, etc.
- Access columns as: row.columnName (use exact column names from headers)
- Handle missing values safely: row.columnName || defaultValue
- Convert types when needed: Number(row.value), String(row.value)
- Return the transformed data structure

Example Code Structure:
\`\`\`javascript
// Your transformation logic here
const transformedData = data.map(row => {
  // Transform each row
  return {
    ...row,
    // Add/modify fields
  };
});

return {
  data: transformedData,
  headers: Object.keys(transformedData[0] || {}),
  changes: {
    // Describe what changed
  }
};
\`\`\`

Generate ONLY the JavaScript code (no explanations, no markdown, just the code):
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let code = response.text().trim();

      // Clean up markdown code blocks if present
      code = code.replace(/```javascript/g, '').replace(/```js/g, '').replace(/```/g, '').trim();

      return {
        success: true,
        code: code,
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ Code Generation Error:', error.message);
      return {
        success: false,
        error: error.message,
        usedFallback: true
      };
    }
  }

  /**
   * Explain anomalies detected in data
   */
  async explainAnomalies(anomalies, dataContext) {
    try {
      const prompt = `
You are a data quality analyst. Explain the detected anomalies in the dataset.

Anomalies Detected:
${JSON.stringify(anomalies, null, 2)}

Dataset Context:
Columns: ${dataContext.columns.join(', ')}
Column Types: ${JSON.stringify(dataContext.columnTypes)}

Provide explanations for each anomaly:
1. Why it's considered an anomaly
2. Potential causes
3. Impact on analysis
4. Recommended actions

Respond in JSON format:
{
  "explanations": [
    {
      "anomalyId": "identifier",
      "explanation": "why this is anomalous",
      "potentialCause": "what might have caused it",
      "impact": "how it affects analysis",
      "recommendation": "what to do about it"
    }
  ],
  "summary": "overall anomaly assessment"
}

Respond ONLY with valid JSON. Do not include markdown formatting.
      `;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON
      let cleanText = text.replace(/```json /g, '').replace(/```/g, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('Could not parse anomaly explanations');
      }

      const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
      const explanations = JSON.parse(jsonStr);

      return {
        success: true,
        explanations: explanations,
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ Anomaly Explanation Error:', error.message);
      return {
        success: false,
        error: error.message,
        usedFallback: true
      };
    }
  }

}

module.exports = new LLMService();