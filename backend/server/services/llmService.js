const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class LLMService {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * Simple rule-based command parser (fallback when AI fails)
   */
  parseCommandFallback(command) {
    const lowerCommand = command.toLowerCase().trim();

    // Clean/cleanup commands
    if (lowerCommand.includes('clean') || lowerCommand.includes('cleanup')) {
      return {
        operation: 'clean',
        parameters: {},
        explanation: 'Will remove duplicates, handle missing values, and standardize formats'
      };
    }

    // Remove duplicates
    if (lowerCommand.includes('duplicate') || lowerCommand.includes('remove duplicate')) {
      return {
        operation: 'remove_duplicates',
        parameters: {},
        explanation: 'Will remove duplicate rows from the dataset'
      };
    }

    // Fill/handle missing values
    if (lowerCommand.includes('fill') || lowerCommand.includes('missing') || lowerCommand.includes('null')) {
      return {
        operation: 'fill_missing',
        parameters: {},
        explanation: 'Will fill missing values with appropriate defaults (mean for numbers, mode for categories)'
      };
    }

    // Remove outliers
    if (lowerCommand.includes('outlier')) {
      return {
        operation: 'remove_outliers',
        parameters: {},
        explanation: 'Will remove statistical outliers using the IQR method'
      };
    }

    // Standardize
    if (lowerCommand.includes('standardize') || lowerCommand.includes('format')) {
      return {
        operation: 'standardize',
        parameters: {},
        explanation: 'Will standardize text formats and remove extra whitespace'
      };
    }

    // Analyze
    if (lowerCommand.includes('analyze') || lowerCommand.includes('stats') || lowerCommand.includes('statistics')) {
      return {
        operation: 'analyze',
        parameters: {},
        explanation: 'Will show statistical analysis of the dataset'
      };
    }

    // Filter/Remove rows - parse conditions from command text
    if ((lowerCommand.includes('remove') || lowerCommand.includes('delete')) && 
        (lowerCommand.includes('row') || lowerCommand.includes('rows') || lowerCommand.includes('where'))) {
      
      const conditions = [];
      
      // Parse "age greater than X" or "age > X" or "age > X"
      const agePatterns = [
        /age\s+(?:greater\s+than|>|gt|more\s+than|above)\s+(\d+)/i,
        /age\s+(?:less\s+than|<|lt|below|under)\s+(\d+)/i,
        /age\s+(?:equal\s+to|==|=|is)\s+(\d+)/i,
        /age\s+(?:greater\s+than\s+or\s+equal|>=|gte)\s+(\d+)/i,
        /age\s+(?:less\s+than\s+or\s+equal|<=|lte)\s+(\d+)/i,
        /customer'?s?\s+age\s+(?:greater\s+than|>|gt|more\s+than|above)\s+(\d+)/i,
        /customer'?s?\s+age\s+(?:less\s+than|<|lt|below|under)\s+(\d+)/i
      ];
      
      for (const pattern of agePatterns) {
        const match = lowerCommand.match(pattern);
        if (match) {
          const value = parseInt(match[1]);
          if (pattern.source.includes('greater') || pattern.source.includes('>') || pattern.source.includes('above') || pattern.source.includes('more')) {
            conditions.push({
              column: 'age',
              operator: 'gt',
              value: value,
              valueType: 'number'
            });
            break;
          } else if (pattern.source.includes('less') || pattern.source.includes('<') || pattern.source.includes('below') || pattern.source.includes('under')) {
            conditions.push({
              column: 'age',
              operator: 'lt',
              value: value,
              valueType: 'number'
            });
            break;
          } else if (pattern.source.includes('equal') || pattern.source.includes('==') || pattern.source.includes('is')) {
            conditions.push({
              column: 'age',
              operator: 'eq',
              value: value,
              valueType: 'number'
            });
            break;
          } else if (pattern.source.includes('>=') || pattern.source.includes('gte')) {
            conditions.push({
              column: 'age',
              operator: 'gte',
              value: value,
              valueType: 'number'
            });
            break;
          } else if (pattern.source.includes('<=') || pattern.source.includes('lte')) {
            conditions.push({
              column: 'age',
              operator: 'lte',
              value: value,
              valueType: 'number'
            });
            break;
          }
        }
      }
      
      // Parse customer IDs (e.g., "customerid 102, 106, 108")
      const idPattern = /(?:customerid|customer\s+id|id)\s+(\d+(?:\s*,\s*\d+)*)/i;
      const idMatch = lowerCommand.match(idPattern);
      if (idMatch) {
        const ids = idMatch[1].split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (ids.length > 0) {
          conditions.push({
            column: 'customerid',
            operator: 'in',
            value: ids,
            valueType: 'array'
          });
        }
      }
      
      // Parse gender (male/female)
      if (lowerCommand.includes('male') && !lowerCommand.includes('female')) {
        conditions.push({
          column: 'gender',
          operator: 'eq',
          value: 'male',
          valueType: 'string'
        });
      } else if (lowerCommand.includes('female')) {
        conditions.push({
          column: 'gender',
          operator: 'eq',
          value: 'female',
          valueType: 'string'
        });
      }
      
      // Parse odd/even
      if (lowerCommand.includes('odd')) {
        const idColMatch = lowerCommand.match(/(customerid|customer\s+id|id)/i);
        conditions.push({
          column: idColMatch ? 'customerid' : 'id',
          operator: 'odd',
          value: null,
          valueType: 'number'
        });
      } else if (lowerCommand.includes('even')) {
        const idColMatch = lowerCommand.match(/(customerid|customer\s+id|id)/i);
        conditions.push({
          column: idColMatch ? 'customerid' : 'id',
          operator: 'even',
          value: null,
          valueType: 'number'
        });
      }
      
      // Generic pattern: "column > value" or "column greater than value"
      if (conditions.length === 0) {
        // Try to extract column name and comparison
        const genericPattern = /(\w+)\s+(?:greater\s+than|>|gt|more\s+than|above)\s+(\d+)/i;
        const genericMatch = lowerCommand.match(genericPattern);
        if (genericMatch) {
          conditions.push({
            column: genericMatch[1],
            operator: 'gt',
            value: parseInt(genericMatch[2]),
            valueType: 'number'
          });
        }
      }
      
      if (conditions.length > 0) {
        return {
          operation: 'filter_rows',
          parameters: {
            conditions: conditions,
            logic: 'AND'
          },
          explanation: `Will remove rows matching: ${conditions.map(c => `${c.column} ${c.operator} ${c.value || ''}`).join(', ')}`
        };
      }
      
      // If we can't parse, still return filter_rows but with empty conditions
      // The controller will handle this and show an error
      return {
        operation: 'filter_rows',
        parameters: {
          conditions: [],
          logic: 'AND'
        },
        explanation: 'Filter operation detected but could not parse conditions from command'
      };
    }

    // Default
    return {
      operation: 'analyze',
      parameters: {},
      explanation: 'Command not recognized. Showing analysis instead.'
    };
  }

  // Suggested addition to LLMService class
  async verifyConnection() {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent("Hello");
      console.log(result.response.text() + "✅ AI Service Connected Successfully");
    } catch (error) {
      console.error("❌ AI Service Connection Failed:", error.message);
    }
  }

  /**
   * Process natural language data commands with flexible execution
   */
  async processDataCommand(command, dataContext) {
    try {
      const prompt = `
You are an advanced data processing assistant. Analyze the user's command and determine the best way to execute it.

Dataset Information:
- Available Columns: ${dataContext.columns.join(', ')}
- Total Rows: ${dataContext.rowCount}
- Column Types: ${JSON.stringify(dataContext.columnTypes, null, 2)}

User Command: "${command}"

Your task is to understand what the user wants and create an execution plan. You have three options:

1. **Use existing operation** - If the command matches a standard operation, use it
2. **Generate custom code** - If the command requires custom logic, generate JavaScript code
3. **Chain operations** - If the command requires multiple steps, create a chain

Response Format:
{
  "type": "operation" | "code" | "chain",
  "explanation": "what will be done",
  ... (type-specific fields below)
}

**Type: "operation"** - For standard operations:
{
  "type": "operation",
  "operation": "filter_rows" | "remove_duplicates" | "fill_missing" | "remove_outliers" | "standardize" | "clean" | "analyze",
  "parameters": { ... operation-specific parameters ... },
  "explanation": "..."
}

Standard Operations:
- "filter_rows": Remove rows based on conditions
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
3. For filter_rows: Use operators: gt, lt, eq, ne, gte, lte, in, not_in, contains, odd, even, date_after, date_before
4. If unsure, prefer "code" type for flexibility
5. For complex operations, use "chain" type

Examples:

Command: "remove rows where age > 25"
Response: {"type": "operation", "operation": "filter_rows", "parameters": {"conditions": [{"column": "age", "operator": "gt", "value": 25, "valueType": "number"}], "logic": "AND"}, "explanation": "Remove rows where age > 25"}

Command: "group sales by region and calculate total"
Response: {"type": "code", "code": "const grouped = data.reduce((acc, row) => { const region = row.region || 'Unknown'; acc[region] = (acc[region] || 0) + (Number(row.sales) || 0); return acc; }, {}); const result = Object.entries(grouped).map(([region, total]) => ({ region, totalSales: total })); return { data: result, headers: ['region', 'totalSales'], changes: { grouped: Object.keys(grouped).length } };", "description": "Group by region and sum sales", "explanation": "Grouping sales data by region and calculating totals"}

Command: "remove duplicates then filter age > 25"
Response: {"type": "chain", "steps": [{"type": "operation", "operation": "remove_duplicates", "parameters": {}}, {"type": "operation", "operation": "filter_rows", "parameters": {"conditions": [{"column": "age", "operator": "gt", "value": 25, "valueType": "number"}], "logic": "AND"}}], "explanation": "First remove duplicates, then filter rows where age > 25"}

Now analyze the user's command and respond with ONLY valid JSON (no markdown, no code blocks):
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Handle backward compatibility: if no "type" field, assume it's an operation
        if (!parsed.type) {
          parsed.type = 'operation';
        }
        
        return {
          success: true,
          command: parsed,
          usedFallback: false
        };
      }

      // If can't parse, use fallback
      console.log('⚠️  Using fallback parser - could not parse AI response');
      return {
        success: true,
        command: this.parseCommandFallback(command),
        usedFallback: true
      };

    } catch (error) {
      console.error('❌ AI Command Processing Error:', error.message);
      console.log('✅ Using fallback rule-based parser');

      // Use fallback on any error
      return {
        success: true,
        command: this.parseCommandFallback(command),
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
  async generateInsights(statistics, sampleData) {
    try {
      const prompt = `
You are a data analyst. Analyze the following dataset statistics and provide actionable insights.

Statistics:
${JSON.stringify(statistics, null, 2)}

Sample Data (first 5 rows):
${JSON.stringify(sampleData, null, 2)}

Provide:
1. Key findings from the data
2. Interesting patterns or trends
3. Potential data quality issues
4. Recommendations for further analysis

Keep insights practical and concise.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      return {
        success: true,
        insights: response.text(),
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ AI Insights Error:', error.message);
      console.log('✅ Using fallback insights generator');

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
  async answerDatasetQuestion(question, dataContext) {
    try {
      const prompt = `
You are a data analysis assistant. Answer the user's question about their dataset.

Dataset Information:
- Columns: ${dataContext.columns.join(', ')}
- Row count: ${dataContext.rowCount}
- Column types: ${JSON.stringify(dataContext.columnTypes, null, 2)}

Statistics Summary:
${JSON.stringify(dataContext.statistics, null, 2)}

Sample Data (first 5 rows):
${JSON.stringify(dataContext.sampleData, null, 2)}

User Question: "${question}"

Provide a clear, concise answer based on the dataset information. If the answer requires calculation or analysis that you can see in the data, provide it. If you need more specific data analysis, suggest what operation they should run.

Keep your response conversational and helpful.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      return {
        success: true,
        answer: response.text(),
        usedFallback: false
      };
    } catch (error) {
      console.error('❌ AI Q&A Error:', error.message);
      console.log('✅ Using fallback answer generator');

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