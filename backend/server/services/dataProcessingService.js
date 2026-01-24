const fs = require('fs');
const Papa = require('papaparse');

class DataProcessingService {
  
  /**
   * Parse CSV file and return data
   */
  async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      Papa.parse(fileContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve({
            data: results.data,
            headers: results.meta.fields,
            rowCount: results.data.length
          });
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

  /**
   * Detect data types for each column
   */
  detectColumnTypes(data, headers) {
    const types = {};
    
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
      
      if (values.length === 0) {
        types[header] = 'empty';
        return;
      }

      // Check if all values are numbers
      const allNumbers = values.every(val => !isNaN(val));
      if (allNumbers) {
        types[header] = 'number';
        return;
      }

      // Check if values are dates
      const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;
      const allDates = values.every(val => datePattern.test(String(val)));
      if (allDates) {
        types[header] = 'date';
        return;
      }

      // Check if categorical (limited unique values)
      const uniqueValues = [...new Set(values)];
      if (uniqueValues.length < values.length * 0.5 && uniqueValues.length < 20) {
        types[header] = 'categorical';
        return;
      }

      types[header] = 'text';
    });

    return types;
  }

  /**
   * Remove duplicate rows
   */
  removeDuplicates(data) {
    const seen = new Set();
    const cleanData = [];
    let duplicatesRemoved = 0;

    data.forEach(row => {
      const rowString = JSON.stringify(row);
      if (!seen.has(rowString)) {
        seen.add(rowString);
        cleanData.push(row);
      } else {
        duplicatesRemoved++;
      }
    });

    return {
      data: cleanData,
      duplicatesRemoved
    };
  }

  /**
   * Handle missing values
   */
  handleMissingValues(data, headers, strategy = 'remove') {
    let changes = {
      rowsRemoved: 0,
      valuesFilled: 0,
      columnsAffected: []
    };

    if (strategy === 'remove') {
      // Remove rows with any missing values
      const originalLength = data.length;
      const cleanData = data.filter(row => {
        return headers.every(header => {
          const value = row[header];
          return value !== null && value !== undefined && value !== '';
        });
      });
      changes.rowsRemoved = originalLength - cleanData.length;
      return { data: cleanData, changes };
    }

    if (strategy === 'fill') {
      // Fill missing values with mean for numbers, mode for categorical
      const columnTypes = this.detectColumnTypes(data, headers);
      
      headers.forEach(header => {
        const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
        
        if (values.length === 0) return;

        let fillValue;
        
        if (columnTypes[header] === 'number') {
          // Fill with mean
          const sum = values.reduce((acc, val) => acc + Number(val), 0);
          fillValue = sum / values.length;
          fillValue = Math.round(fillValue * 100) / 100; // Round to 2 decimals
        } else {
          // Fill with mode (most frequent value)
          const frequency = {};
          values.forEach(val => {
            frequency[val] = (frequency[val] || 0) + 1;
          });
          fillValue = Object.keys(frequency).reduce((a, b) => 
            frequency[a] > frequency[b] ? a : b
          );
        }

        // Apply fill
        data.forEach(row => {
          if (row[header] === null || row[header] === undefined || row[header] === '') {
            row[header] = fillValue;
            changes.valuesFilled++;
            if (!changes.columnsAffected.includes(header)) {
              changes.columnsAffected.push(header);
            }
          }
        });
      });
    }

    return { data, changes };
  }

  /**
   * Remove outliers using IQR method
   */
  removeOutliers(data, headers) {
    const columnTypes = this.detectColumnTypes(data, headers);
    let outliersRemoved = 0;
    const affectedColumns = [];

    // Only process numeric columns
    const numericColumns = headers.filter(h => columnTypes[h] === 'number');

    numericColumns.forEach(column => {
      const values = data.map(row => Number(row[column])).filter(val => !isNaN(val)).sort((a, b) => a - b);
      
      if (values.length === 0) return;

      // Calculate Q1, Q3, and IQR
      const q1Index = Math.floor(values.length * 0.25);
      const q3Index = Math.floor(values.length * 0.75);
      const q1 = values[q1Index];
      const q3 = values[q3Index];
      const iqr = q3 - q1;
      
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      // Filter out outliers
      const originalLength = data.length;
      data = data.filter(row => {
        const value = Number(row[column]);
        return value >= lowerBound && value <= upperBound;
      });

      if (data.length < originalLength) {
        affectedColumns.push(column);
        outliersRemoved += (originalLength - data.length);
      }
    });

    return {
      data,
      outliersRemoved,
      affectedColumns
    };
  }

  /**
   * Standardize data formats
   */
  standardizeFormats(data, headers) {
    const changes = [];
    
    headers.forEach(header => {
      data.forEach(row => {
        const value = row[header];
        
        if (typeof value === 'string') {
          // Trim whitespace
          const trimmed = value.trim();
          if (trimmed !== value) {
            row[header] = trimmed;
            if (!changes.includes(header)) {
              changes.push(header);
            }
          }

          // Standardize case for categorical columns
          const uniqueValues = [...new Set(data.map(r => r[header]))];
          if (uniqueValues.length < 20) {
            row[header] = trimmed.toLowerCase();
          }
        }
      });
    });

    return { data, changes };
  }

  /**
   * Filter rows based on conditions
   */
  filterRows(data, headers, filterParams) {
    const { conditions, logic = 'AND' } = filterParams;
    
    if (!conditions || conditions.length === 0) {
      return {
        data: data,
        rowsRemoved: 0,
        originalCount: data.length
      };
    }

    // Helper function to find column name with fuzzy matching
    const findColumn = (columnName) => {
      if (!columnName) return null;
      
      // Exact match (case-sensitive)
      if (headers.includes(columnName)) {
        return columnName;
      }
      
      // Case-insensitive match
      const lowerColumn = columnName.toLowerCase().trim();
      const exactMatch = headers.find(h => h.toLowerCase() === lowerColumn);
      if (exactMatch) return exactMatch;
      
      // Partial match - remove common words and match
      const cleanColumn = lowerColumn
        .replace(/^(customer'?s?|the|a|an)\s+/i, '') // Remove "customer's", "the", etc.
        .replace(/\s+(of|for|in|at|on)\s+/i, ' ') // Remove prepositions
        .trim();
      
      // Try to find column that contains the cleaned name
      const partialMatch = headers.find(h => {
        const hLower = h.toLowerCase();
        return hLower.includes(cleanColumn) || cleanColumn.includes(hLower);
      });
      if (partialMatch) return partialMatch;
      
      // Try camelCase/snake_case variations
      const camelCase = cleanColumn.replace(/\s+/g, '');
      const snakeCase = cleanColumn.replace(/\s+/g, '_');
      const pascalCase = camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
      
      const variations = [camelCase, snakeCase, pascalCase, camelCase.toLowerCase(), snakeCase.toLowerCase()];
      for (const variant of variations) {
        const match = headers.find(h => h.toLowerCase() === variant.toLowerCase());
        if (match) return match;
      }
      
      return null;
    };

    // Normalize column names in conditions before filtering
    conditions.forEach(condition => {
      const foundColumn = findColumn(condition.column);
      if (foundColumn) {
        condition.column = foundColumn; // Update to actual column name
      }
    });

    const originalCount = data.length;
    let filteredData;

    // Helper function to evaluate a single condition
    const evaluateCondition = (row, condition) => {
      const { column, operator, value, valueType } = condition;
      const actualColumn = findColumn(column);
      
      if (!actualColumn) {
        console.warn(`⚠️  Column "${column}" not found. Available columns: ${headers.join(', ')}`);
        return false; // Column doesn't exist
      }

      const cellValue = row[actualColumn];
      
      try {
        switch (operator) {
          case 'gt': return Number(cellValue) > Number(value);
          case 'lt': return Number(cellValue) < Number(value);
          case 'eq': return String(cellValue).toLowerCase() === String(value).toLowerCase();
          case 'ne': return String(cellValue).toLowerCase() !== String(value).toLowerCase();
          case 'gte': return Number(cellValue) >= Number(value);
          case 'lte': return Number(cellValue) <= Number(value);
          case 'in': return Array.isArray(value) && value.some(v => Number(v) === Number(cellValue) || String(v).toLowerCase() === String(cellValue).toLowerCase());
          case 'not_in': return Array.isArray(value) && !value.some(v => Number(v) === Number(cellValue) || String(v).toLowerCase() === String(cellValue).toLowerCase());
          case 'contains': return String(cellValue).toLowerCase().includes(String(value).toLowerCase());
          case 'not_contains': return !String(cellValue).toLowerCase().includes(String(value).toLowerCase());
          case 'odd': return !isNaN(Number(cellValue)) && Number(cellValue) % 2 !== 0;
          case 'even': return !isNaN(Number(cellValue)) && Number(cellValue) % 2 === 0;
          case 'date_after': {
            const d1 = new Date(cellValue);
            const d2 = new Date(value);
            return !isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1 > d2;
          }
          case 'date_before': {
            const d1 = new Date(cellValue);
            const d2 = new Date(value);
            return !isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1 < d2;
          }
          default: return false;
        }
      } catch {
        return false;
      }
    };

    // Apply filtering based on logic
    if (logic === 'OR' && conditions.length > 1) {
      // OR logic: remove rows that match ANY condition
      filteredData = data.filter(row => {
        return !conditions.some(condition => evaluateCondition(row, condition));
      });
    } else {
      // AND logic (default): remove rows that match ALL conditions
      filteredData = data.filter(row => {
        const matchesAll = conditions.every(condition => evaluateCondition(row, condition));
        return !matchesAll; // Keep rows that DON'T match all conditions
      });
    }

    const rowsRemoved = originalCount - filteredData.length;

    return {
      data: filteredData,
      rowsRemoved: rowsRemoved,
      originalCount: originalCount,
      conditions: conditions
    };
  }

  /**
   * Get basic statistics
   */
  getStatistics(data, headers) {
    const columnTypes = this.detectColumnTypes(data, headers);
    const stats = {};

    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined);
      
      stats[header] = {
        type: columnTypes[header],
        count: values.length,
        missing: data.length - values.length
      };

      if (columnTypes[header] === 'number') {
        const numbers = values.map(v => Number(v));
        const sum = numbers.reduce((acc, val) => acc + val, 0);
        const mean = sum / numbers.length;
        const sorted = numbers.sort((a, b) => a - b);
        
        stats[header] = {
          ...stats[header],
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          mean: Math.round(mean * 100) / 100,
          median: sorted[Math.floor(sorted.length / 2)]
        };
      } else if (columnTypes[header] === 'categorical' || columnTypes[header] === 'text') {
        const uniqueValues = [...new Set(values)];
        stats[header] = {
          ...stats[header],
          uniqueValues: uniqueValues.length,
          topValues: this.getTopValues(values, 5)
        };
      }
    });

    return stats;
  }

  /**
   * Get top N most frequent values
   */
  getTopValues(values, n = 5) {
    const frequency = {};
    values.forEach(val => {
      frequency[val] = (frequency[val] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([value, count]) => ({ value, count }));
  }

  /**
   * Apply formula to dataset (Excel or JavaScript)
   */
  applyFormula(data, headers, formulaData) {
    const { formulaType, formula, newColumnName } = formulaData;
    const results = [];
    let errors = 0;

    if (formulaType === 'javascript') {
      // JavaScript formula evaluation
      data.forEach((row, index) => {
        try {
          // Create a safe evaluation context
          const context = { row, index, ...row };
          // Use Function constructor for safer evaluation
          const func = new Function('row', 'index', ...headers, `return ${formula}`);
          const value = func(row, index, ...headers.map(h => row[h]));
          results.push(value);
        } catch (error) {
          console.error(`Error evaluating formula at row ${index}:`, error.message);
          results.push(null);
          errors++;
        }
      });
    } else if (formulaType === 'excel') {
      // Excel formula - convert to JavaScript equivalent
      // This is a simplified parser - for production, use a proper Excel formula parser
      let jsFormula = formula;
      
      // Basic Excel to JS conversions
      jsFormula = jsFormula.replace(/=/g, ''); // Remove = sign
      // Replace column references (A, B, C) with row values
      // This is simplified - assumes columns are referenced by name in the formula
      
      data.forEach((row, index) => {
        try {
          const context = { row, index, ...row };
          const func = new Function('row', 'index', ...headers, `return ${jsFormula}`);
          const value = func(row, index, ...headers.map(h => row[h]));
          results.push(value);
        } catch (error) {
          console.error(`Error evaluating Excel formula at row ${index}:`, error.message);
          results.push(null);
          errors++;
        }
      });
    }

    // Add new column to data
    const newData = data.map((row, index) => ({
      ...row,
      [newColumnName]: results[index]
    }));

    return {
      data: newData,
      newColumn: newColumnName,
      errors: errors,
      success: errors === 0
    };
  }

  /**
   * Transform a column based on manipulation request
   */
  transformColumn(data, headers, manipulation) {
    const { operation, targetColumn, newColumnName, parameters } = manipulation;
    const results = [];
    let errors = 0;

    switch (operation) {
      case 'convert':
        data.forEach((row, index) => {
          try {
            const value = row[targetColumn];
            let transformed = value;

            switch (parameters.toType) {
              case 'number':
                transformed = Number(value) || 0;
                break;
              case 'string':
                transformed = String(value);
                break;
              case 'uppercase':
                transformed = String(value).toUpperCase();
                break;
              case 'lowercase':
                transformed = String(value).toLowerCase();
                break;
              case 'date':
                transformed = new Date(value);
                break;
              default:
                transformed = value;
            }
            results.push(transformed);
          } catch (error) {
            results.push(row[targetColumn]);
            errors++;
          }
        });
        break;

      case 'extract':
        data.forEach((row) => {
          try {
            const value = String(row[targetColumn] || '');
            let extracted = '';

            switch (parameters.pattern) {
              case 'year':
                const date = new Date(value);
                extracted = date.getFullYear() || '';
                break;
              case 'month':
                const date2 = new Date(value);
                extracted = (date2.getMonth() + 1) || '';
                break;
              case 'day':
                const date3 = new Date(value);
                extracted = date3.getDate() || '';
                break;
              case 'first_word':
                extracted = value.split(/\s+/)[0] || '';
                break;
              case 'last_word':
                const words = value.split(/\s+/);
                extracted = words[words.length - 1] || '';
                break;
              default:
                if (parameters.regex) {
                  const match = value.match(new RegExp(parameters.regex));
                  extracted = match ? match[0] : '';
                } else {
                  extracted = value;
                }
            }
            results.push(extracted);
          } catch (error) {
            results.push('');
            errors++;
          }
        });
        break;

      case 'calculate':
        data.forEach((row) => {
          try {
            const value = Number(row[targetColumn]) || 0;
            let result = value;

            if (parameters.operation === 'multiply') {
              const multiplier = Number(parameters.value) || (row[parameters.value] ? Number(row[parameters.value]) : 1);
              result = value * multiplier;
            } else if (parameters.operation === 'divide') {
              const divisor = Number(parameters.value) || (row[parameters.value] ? Number(row[parameters.value]) : 1);
              result = divisor !== 0 ? value / divisor : 0;
            } else if (parameters.operation === 'add') {
              const addend = Number(parameters.value) || (row[parameters.value] ? Number(row[parameters.value]) : 0);
              result = value + addend;
            } else if (parameters.operation === 'subtract') {
              const subtrahend = Number(parameters.value) || (row[parameters.value] ? Number(row[parameters.value]) : 0);
              result = value - subtrahend;
            }
            results.push(result);
          } catch (error) {
            results.push(row[targetColumn]);
            errors++;
          }
        });
        break;

      case 'conditional':
        data.forEach((row) => {
          try {
            // Simple conditional evaluation
            const condition = parameters.condition;
            // Replace column references in condition
            let evalCondition = condition;
            headers.forEach(header => {
              const regex = new RegExp(`\\b${header}\\b`, 'g');
              evalCondition = evalCondition.replace(regex, `row['${header}']`);
            });

            const conditionMet = new Function('row', `return ${evalCondition}`)(row);
            results.push(conditionMet ? parameters.trueValue : parameters.falseValue);
          } catch (error) {
            results.push(row[targetColumn]);
            errors++;
          }
        });
        break;

      default:
        // Generic transform - just copy the column
        data.forEach((row) => {
          results.push(row[targetColumn]);
        });
    }

    // Apply transformation
    const columnName = newColumnName || targetColumn;
    const newData = data.map((row, index) => ({
      ...row,
      [columnName]: results[index]
    }));

    return {
      data: newData,
      columnName: columnName,
      errors: errors,
      success: errors === 0
    };
  }

  /**
   * Calculate data quality score
   */
  calculateQualityScore(data, headers, statistics) {
    let score = 100;
    const issues = [];

    // Check for missing values
    headers.forEach(header => {
      const missing = statistics[header]?.missing || 0;
      const total = data.length;
      const missingPercentage = (missing / total) * 100;
      
      if (missingPercentage > 0) {
        score -= missingPercentage * 0.5; // Deduct 0.5 points per 1% missing
        issues.push({
          type: 'missing_values',
          column: header,
          severity: missingPercentage > 20 ? 'high' : missingPercentage > 10 ? 'medium' : 'low',
          message: `${missingPercentage.toFixed(1)}% missing values`
        });
      }
    });

    // Check for duplicates
    const duplicates = this.removeDuplicates(data);
    const duplicatePercentage = ((data.length - duplicates.data.length) / data.length) * 100;
    if (duplicatePercentage > 0) {
      score -= duplicatePercentage * 0.3;
      issues.push({
        type: 'duplicates',
        severity: duplicatePercentage > 10 ? 'high' : 'medium',
        message: `${duplicatePercentage.toFixed(1)}% duplicate rows`
      });
    }

    // Check for outliers in numeric columns
    const numericHeaders = headers.filter(h => statistics[h]?.type === 'number');
    numericHeaders.forEach(header => {
      const values = data.map(row => Number(row[header])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        const outliers = values.filter(v => v < lowerBound || v > upperBound);
        const outlierPercentage = (outliers.length / values.length) * 100;
        
        if (outlierPercentage > 5) {
          score -= outlierPercentage * 0.2;
          issues.push({
            type: 'outliers',
            column: header,
            severity: outlierPercentage > 15 ? 'high' : 'medium',
            message: `${outlierPercentage.toFixed(1)}% outliers detected`
          });
        }
      }
    });

    // Check for inconsistent data types
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(v => v !== null && v !== undefined);
      if (values.length > 0) {
        const types = new Set(values.map(v => typeof v));
        if (types.size > 1 && statistics[header]?.type === 'number') {
          score -= 5;
          issues.push({
            type: 'type_inconsistency',
            column: header,
            severity: 'medium',
            message: 'Mixed data types detected'
          });
        }
      }
    });

    score = Math.max(0, Math.min(100, score)); // Clamp between 0 and 100

    return {
      score: Math.round(score),
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
      issues: issues,
      totalIssues: issues.length
    };
  }

  /**
   * Detect anomalies in data
   */
  detectAnomalies(data, headers, statistics) {
    const anomalies = [];

    // Statistical outliers
    const numericHeaders = headers.filter(h => statistics[h]?.type === 'number');
    numericHeaders.forEach(header => {
      const values = data.map((row, index) => ({
        value: Number(row[header]),
        index: index,
        row: row
      })).filter(item => !isNaN(item.value));

      if (values.length > 0) {
        const numbers = values.map(v => v.value);
        const sorted = [...numbers].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        values.forEach(item => {
          if (item.value < lowerBound || item.value > upperBound) {
            anomalies.push({
              id: `outlier_${header}_${item.index}`,
              type: 'outlier',
              column: header,
              rowIndex: item.index,
              value: item.value,
              expectedRange: { min: lowerBound, max: upperBound },
              severity: 'medium'
            });
          }
        });
      }
    });

    // Missing values in critical columns
    headers.forEach(header => {
      const missingCount = statistics[header]?.missing || 0;
      const total = data.length;
      if (missingCount > 0 && (missingCount / total) > 0.1) {
        anomalies.push({
          id: `missing_${header}`,
          type: 'missing_data',
          column: header,
          missingCount: missingCount,
          missingPercentage: ((missingCount / total) * 100).toFixed(1),
          severity: (missingCount / total) > 0.3 ? 'high' : 'medium'
        });
      }
    });

    // Duplicate rows
    const seen = new Set();
    data.forEach((row, index) => {
      const rowString = JSON.stringify(row);
      if (seen.has(rowString)) {
        anomalies.push({
          id: `duplicate_${index}`,
          type: 'duplicate',
          rowIndex: index,
          severity: 'low'
        });
      }
      seen.add(rowString);
    });

    // Unusual patterns (e.g., all same value)
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(v => v !== null && v !== undefined);
      if (values.length > 10) {
        const uniqueValues = new Set(values);
        if (uniqueValues.size === 1) {
          anomalies.push({
            id: `constant_${header}`,
            type: 'constant_value',
            column: header,
            value: values[0],
            severity: 'low',
            message: 'Column contains only one unique value'
          });
        }
      }
    });

    return anomalies;
  }

  /**
   * Detect column relationships
   */
  detectRelationships(data, headers, columnTypes) {
    const relationships = [];

    // Check for mathematical relationships
    const numericColumns = headers.filter(h => columnTypes[h] === 'number');
    
    for (let i = 0; i < numericColumns.length; i++) {
      for (let j = i + 1; j < numericColumns.length; j++) {
        const col1 = numericColumns[i];
        const col2 = numericColumns[j];
        
        // Check if col1 * col2 might equal another column
        const product = data.map(row => {
          const v1 = Number(row[col1]) || 0;
          const v2 = Number(row[col2]) || 0;
          return v1 * v2;
        });

        // Check if any other column matches this product
        numericColumns.forEach(col3 => {
          if (col3 !== col1 && col3 !== col2) {
            const col3Values = data.map(row => Number(row[col3]) || 0);
            const matches = product.filter((val, idx) => Math.abs(val - col3Values[idx]) < 0.01);
            if (matches.length > data.length * 0.9) {
              relationships.push({
                type: 'mathematical',
                columns: [col1, col2, col3],
                relationship: `${col1} × ${col2} = ${col3}`,
                formula: `${col1} * ${col2}`,
                confidence: 'high'
              });
            }
          }
        });
      }
    }

    // Check for sum relationships
    numericColumns.forEach(targetCol => {
      const otherCols = numericColumns.filter(c => c !== targetCol);
      if (otherCols.length >= 2) {
        // Check if sum of other columns equals target
        const sums = data.map(row => {
          return otherCols.reduce((sum, col) => sum + (Number(row[col]) || 0), 0);
        });
        const targetValues = data.map(row => Number(row[targetCol]) || 0);
        const matches = sums.filter((val, idx) => Math.abs(val - targetValues[idx]) < 0.01);
        if (matches.length > data.length * 0.9) {
          relationships.push({
            type: 'mathematical',
            columns: [...otherCols, targetCol],
            relationship: `${otherCols.join(' + ')} = ${targetCol}`,
            formula: otherCols.join(' + '),
            confidence: 'high'
          });
        }
      }
    });

    return relationships;
  }
}

module.exports = new DataProcessingService();