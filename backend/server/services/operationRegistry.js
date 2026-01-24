/**
 * Operation Registry
 * Central registry for all data operations
 */

const dataProcessingService = require('./dataProcessingService');

class OperationRegistry {
  constructor() {
    this.operations = new Map();
    this.registerDefaultOperations();
  }

  /**
   * Register default operations
   */
  registerDefaultOperations() {
    // Filter rows
    this.register('filter_rows', {
      handler: async (data, headers, params) => {
        const result = dataProcessingService.filterRows(data, headers, params);
        return {
          data: result.data,
          headers: headers,
          changes: {
            rowsRemoved: result.rowsRemoved,
            originalCount: result.originalCount
          }
        };
      },
      description: 'Remove rows based on conditions'
    });

    // Remove duplicates
    this.register('remove_duplicates', {
      handler: async (data, headers, params) => {
        const result = dataProcessingService.removeDuplicates(data);
        return {
          data: result.data,
          headers: headers,
          changes: {
            duplicatesRemoved: result.duplicatesRemoved
          }
        };
      },
      description: 'Remove duplicate rows'
    });

    // Fill missing values
    this.register('fill_missing', {
      handler: async (data, headers, params) => {
        const result = dataProcessingService.handleMissingValues(data, headers, 'fill');
        return {
          data: result.data,
          headers: headers,
          changes: result.changes
        };
      },
      description: 'Fill missing values'
    });

    // Remove outliers
    this.register('remove_outliers', {
      handler: async (data, headers, params) => {
        const statistics = dataProcessingService.getStatistics(data, headers);
        const result = dataProcessingService.removeOutliers(data, headers);
        return {
          data: result.data,
          headers: headers,
          changes: {
            outliersRemoved: result.outliersRemoved,
            affectedColumns: result.affectedColumns
          }
        };
      },
      description: 'Remove statistical outliers'
    });

    // Standardize formats
    this.register('standardize', {
      handler: async (data, headers, params) => {
        const result = dataProcessingService.standardizeFormats(data, headers);
        return {
          data: result.data,
          headers: headers,
          changes: {
            columnsAffected: result.changes
          }
        };
      },
      description: 'Standardize text formats'
    });

    // Clean (full pipeline)
    this.register('clean', {
      handler: async (data, headers, params) => {
        let currentData = data;
        let changes = {};

        // Remove duplicates
        const dupResult = dataProcessingService.removeDuplicates(currentData);
        currentData = dupResult.data;
        changes.duplicatesRemoved = dupResult.duplicatesRemoved;

        // Handle missing values
        const missingResult = dataProcessingService.handleMissingValues(currentData, headers, 'remove');
        currentData = missingResult.data;
        changes.rowsRemoved = missingResult.changes.rowsRemoved;

        // Standardize formats
        const formatResult = dataProcessingService.standardizeFormats(currentData, headers);
        currentData = formatResult.data;
        changes.columnsStandardized = formatResult.changes.length;

        return {
          data: currentData,
          headers: headers,
          changes: changes
        };
      },
      description: 'Full data cleaning pipeline'
    });

    // Analyze
    this.register('analyze', {
      handler: async (data, headers, params) => {
        const statistics = dataProcessingService.getStatistics(data, headers);
        return {
          data: data,
          headers: headers,
          changes: {},
          statistics: statistics
        };
      },
      description: 'Analyze data and return statistics'
    });
  }

  /**
   * Register a new operation
   */
  register(name, operation) {
    this.operations.set(name, operation);
  }

  /**
   * Get an operation
   */
  get(name) {
    return this.operations.get(name);
  }

  /**
   * Check if operation exists
   */
  has(name) {
    return this.operations.has(name);
  }

  /**
   * List all registered operations
   */
  list() {
    return Array.from(this.operations.entries()).map(([name, op]) => ({
      name,
      description: op.description
    }));
  }
}

module.exports = new OperationRegistry();
