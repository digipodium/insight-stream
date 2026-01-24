/**
 * Safe Code Executor Service
 * Executes user-generated JavaScript code in a controlled environment
 */

class CodeExecutorService {
  /**
   * Execute JavaScript code safely
   */
  executeCode(code, data, headers) {
    try {
      // Create a safe execution context
      const context = {
        data: JSON.parse(JSON.stringify(data)), // Deep clone
        headers: [...headers],
        // Provide safe utility functions
        utils: {
          sum: (arr) => arr.reduce((a, b) => a + b, 0),
          avg: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
          min: (arr) => Math.min(...arr),
          max: (arr) => Math.max(...arr),
          groupBy: (arr, key) => {
            return arr.reduce((acc, item) => {
              const group = item[key] || 'Unknown';
              if (!acc[group]) acc[group] = [];
              acc[group].push(item);
              return acc;
            }, {});
          }
        }
      };

      // Wrap code in a function that returns the result
      const wrappedCode = `
        (function(data, headers, utils) {
          ${code}
        })(data, headers, utils);
      `;

      // Execute the code
      const result = eval(wrappedCode);

      // Validate result
      if (!result || typeof result !== 'object') {
        throw new Error('Code must return an object with {data, headers, changes}');
      }

      if (!Array.isArray(result.data)) {
        throw new Error('Result.data must be an array');
      }

      if (!Array.isArray(result.headers)) {
        // Infer headers from data if not provided
        result.headers = result.data.length > 0 ? Object.keys(result.data[0]) : headers;
      }

      return {
        success: true,
        data: result.data,
        headers: result.headers,
        changes: result.changes || {},
        error: null
      };
    } catch (error) {
      console.error('❌ Code Execution Error:', error.message);
      return {
        success: false,
        data: data,
        headers: headers,
        changes: {},
        error: error.message
      };
    }
  }

  /**
   * Validate code before execution
   */
  validateCode(code) {
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s+/,
      /process\./,
      /global\./,
      /__dirname/,
      /__filename/,
      /eval\s*\(/,
      /Function\s*\(/,
      /setTimeout/,
      /setInterval/,
      /fs\./,
      /child_process/,
      /exec\s*\(/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          valid: false,
          error: `Code contains potentially dangerous pattern: ${pattern}`
        };
      }
    }

    return { valid: true };
  }
}

module.exports = new CodeExecutorService();
