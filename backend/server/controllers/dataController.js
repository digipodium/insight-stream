const fs = require('fs');
const dataProcessingService = require('../services/dataProcessingService');
const llmService = require('../services/llmService');
const Dataset = require('../models/Dataset');
const ExcelJS = require('exceljs');

// Helper function to normalize operation names
const normalizeOperation = (operation) => {
  if (!operation) return 'unknown';

  // Convert to lowercase and replace spaces with underscores
  const normalized = operation.toLowerCase().trim().replace(/\s+/g, '_');

  // Map variations to standard names
  const operationMap = {
    'clean': 'clean',
    'clean_data': 'clean',
    'clean_this_data': 'clean',
    'cleanup': 'clean',
    'remove_duplicates': 'remove_duplicates',
    'remove_duplicate': 'remove_duplicates',
    'duplicates': 'remove_duplicates',
    'fill_missing': 'fill_missing',
    'handle_missing': 'fill_missing',
    'fill_missing_values': 'fill_missing',
    'missing': 'fill_missing',
    'remove_outliers': 'remove_outliers',
    'outliers': 'remove_outliers',
    'standardize': 'standardize',
    'standardize_formats': 'standardize',
    'format': 'standardize',
    'analyze': 'analyze',
    'stats': 'analyze',
    'statistics': 'analyze',
    'show_stats': 'analyze'
  };

  return operationMap[normalized] || normalized;
};

// @desc Upload and parse CSV file
// @route POST /api/data/upload
exports.uploadCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Parse CSV
    const parsedData = await dataProcessingService.parseCSV(req.file.path);

    // Detect column types
    const columnTypes = dataProcessingService.detectColumnTypes(
      parsedData.data,
      parsedData.headers
    );

    // Create new Dataset in MongoDB
    // Assuming req.user is populated by auth middleware
    const dataset = await Dataset.create({
      user: req.user._id,
      fileName: req.file.originalname,
      rowCount: parsedData.rowCount,
      columnCount: parsedData.headers.length,
      headers: parsedData.headers,
      columnTypes: columnTypes,
      data: parsedData.data,
      insights: []
    });

    // Delete uploaded file from disk
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: 'File uploaded and parsed successfully',
      dataId: dataset._id,
      info: {
        fileName: dataset.fileName,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        headers: dataset.headers,
        columnTypes: dataset.columnTypes,
        preview: dataset.data.slice(0, 100) // First 100 rows
      }
    });

  } catch (error) {
    console.error('Upload Error:', error);

    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error processing file',
      error: error.message
    });
  }
};

// @desc Process natural language command on data
// @route POST /api/data/process
exports.processCommand = async (req, res) => {
  try {
    const { dataId, command } = req.body;

    if (!dataId || !command) {
      return res.status(400).json({
        success: false,
        message: 'dataId and command are required'
      });
    }

    const dataset = await Dataset.findById(dataId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
    }

    // Check ownership
    // Optional: if (dataset.user.toString() !== req.user.id) return res.status(401)...;

    // Parse command using LLM (with fallback)
    const commandResult = await llmService.processDataCommand(command, {
      columns: dataset.headers,
      rowCount: dataset.data.length,
      columnTypes: dataset.columnTypes
    });

    console.log('📝 Command Result:', JSON.stringify(commandResult, null, 2));

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Could not understand command',
        error: commandResult.error
      });
    }

    if (commandResult.usedFallback) {
      console.log('ℹ️  Using rule-based command processing (AI unavailable)');
    }

    const rawOperation = commandResult.command.operation;
    const operation = normalizeOperation(rawOperation);
    console.log('🔧 Raw operation:', rawOperation);
    console.log('🔧 Normalized operation:', operation);
    let result;
    let operations = [];

    // Execute the operation
    switch (operation) {
      case 'clean':
        // Full cleaning pipeline
        console.log('🧹 Starting full data cleaning...');

        const dupResult = dataProcessingService.removeDuplicates(dataset.data);
        console.log(`   ✓ Removed ${dupResult.duplicatesRemoved} duplicates`);

        const missingResult = dataProcessingService.handleMissingValues(
          dupResult.data,
          dataset.headers,
          'remove'
        );
        console.log(`   ✓ Removed ${missingResult.changes.rowsRemoved} rows with missing values`);

        const formatResult = dataProcessingService.standardizeFormats(
          missingResult.data,
          dataset.headers
        );
        console.log(`   ✓ Standardized ${formatResult.changes.length} columns`);

        result = formatResult;
        operations = [
          { type: 'remove_duplicates', details: { removed: dupResult.duplicatesRemoved } },
          { type: 'handle_missing', details: missingResult.changes },
          { type: 'standardize_formats', details: { columnsAffected: formatResult.changes } }
        ];
        break;

      case 'remove_duplicates':
        console.log('🔍 Removing duplicates...');
        result = dataProcessingService.removeDuplicates(dataset.data);
        operations = [{ type: 'remove_duplicates', details: { removed: result.duplicatesRemoved } }];
        console.log(`   ✓ Removed ${result.duplicatesRemoved} duplicates`);
        break;

      case 'fill_missing':
        console.log('📝 Filling missing values...');
        result = dataProcessingService.handleMissingValues(
          dataset.data,
          dataset.headers,
          'fill'
        );
        operations = [{ type: 'fill_missing', details: result.changes }];
        console.log(`   ✓ Filled ${result.changes.valuesFilled} missing values`);
        break;

      case 'remove_outliers':
        console.log('📊 Removing outliers...');
        result = dataProcessingService.removeOutliers(dataset.data, dataset.headers);
        operations = [{ type: 'remove_outliers', details: result }];
        console.log(`   ✓ Removed ${result.outliersRemoved} outliers`);
        break;

      case 'standardize':
        console.log('✨ Standardizing formats...');
        result = dataProcessingService.standardizeFormats(dataset.data, dataset.headers);
        operations = [{ type: 'standardize_formats', details: { columnsAffected: result.changes } }];
        console.log(`   ✓ Standardized ${result.changes.length} columns`);
        break;

      case 'analyze':
        console.log('📈 Analyzing data...');
        const stats = dataProcessingService.getStatistics(dataset.data, dataset.headers);
        return res.json({
          success: true,
          operation: 'analyze',
          statistics: stats,
          preview: dataset.data.slice(0, 10)
        });

      default:
        console.log('❌ Unknown operation:', operation);
        console.log('💡 Supported operations: clean, remove_duplicates, fill_missing, remove_outliers, standardize, analyze');
        return res.status(400).json({
          success: false,
          message: `Unknown operation: "${operation}". Supported operations: clean, remove_duplicates, fill_missing, remove_outliers, standardize, analyze`
        });
    }

    // Update dataset in MongoDB
    dataset.data = result.data;
    if (dataset.data.length > 0) {
      dataset.headers = Object.keys(dataset.data[0]);
      dataset.rowCount = dataset.data.length;
      // Ideally update columnTypes too
    }
    await dataset.save();

    console.log('💬 Generating explanation...');
    // Get AI explanation of changes
    const explanation = await llmService.explainDataCleaning(operations);

    console.log('✅ Processing complete!');

    res.json({
      success: true,
      operation: operation,
      operations: operations,
      explanation: explanation.explanation,
      aiPowered: !explanation.usedFallback,
      result: {
        rowsBefore: commandResult.rowsBefore || dataset.rowCount, // approximation if not tracked perfectly across steps
        rowsAfter: dataset.data.length,
        rowsChanged: (commandResult.rowsBefore || dataset.rowCount) - dataset.data.length,
        headers: dataset.headers,
        preview: dataset.data.slice(0, 100)
      }
    });

  } catch (error) {
    console.error('❌ Process Command Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing command',
      error: error.message
    });
  }
};

// @desc Get insights from data
// @route POST /api/data/insights
exports.getInsights = async (req, res) => {
  try {
    const { dataId } = req.body;

    if (!dataId) {
      return res.status(400).json({
        success: false,
        message: 'dataId is required'
      });
    }

    const dataset = await Dataset.findById(dataId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
    }

    // Get statistics
    const statistics = dataProcessingService.getStatistics(
      dataset.data,
      dataset.headers
    );

    // Generate AI insights
    const insightsResult = await llmService.generateInsights(
      statistics,
      dataset.data.slice(0, 5)
    );

    // Store insights in DB
    dataset.insights = insightsResult.insights || [];
    await dataset.save();

    res.json({
      success: true,
      statistics: statistics,
      insights: insightsResult.insights
    });

  } catch (error) {
    console.error('Get Insights Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating insights',
      error: error.message
    });
  }
};

// @desc Download processed data with Chart
// @route GET /api/data/download/:dataId
exports.downloadData = async (req, res) => {
  try {
    const { dataId } = req.params;

    const dataset = await Dataset.findById(dataId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
    }

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');

    // Add headers
    worksheet.columns = dataset.headers.map(header => ({
      header: header,
      key: header,
      width: 20
    }));

    // Add rows
    worksheet.addRows(dataset.data);

    // Determine columns for chart
    let xColName, yColName;
    const CHART_TYPE = 'bar'; // Default to bar for now

    // Check if we have a context-aware config from previous interaction
    if (dataset.latestChartConfig && dataset.latestChartConfig.xAxisColumn && dataset.latestChartConfig.yAxisColumn) {
      xColName = dataset.latestChartConfig.xAxisColumn;
      yColName = dataset.latestChartConfig.yAxisColumn;
      console.log(`📊 Using context-aware config: X=${xColName}, Y=${yColName}`);
    } else {
      // Heuristic: First string = X, First number = Y
      // We need to re-detect column types or rely on stored ones. Stored ones might be old if we didn't update them on cleaning.
      // Let's rely on stored columnTypes for now or re-detect quickly.

      const numericCols = Object.keys(dataset.columnTypes).filter(col => dataset.columnTypes[col] === 'number');
      const stringCols = Object.keys(dataset.columnTypes).filter(col => dataset.columnTypes[col] !== 'number');

      // Prefer string for X, but if none, use first numeric
      xColName = stringCols.length > 0 ? stringCols[0] : (numericCols.length > 0 ? numericCols[0] : dataset.headers[0]);
      // Prefer numeric for Y
      yColName = numericCols.length > 0 ? numericCols[0] : (numericCols.length > 1 ? numericCols[1] : dataset.headers[1]); // Fallback
      console.log(`📊 Using heuristic config: X=${xColName}, Y=${yColName}`);
    }

    // Simply verifying columns exist
    const xIndex = dataset.headers.indexOf(xColName);
    const yIndex = dataset.headers.indexOf(yColName);

    if (xIndex !== -1 && yIndex !== -1) {
      // Helper to get column letter (0 -> A, 1 -> B)
      const getLetter = (colIndex) => {
        let temp, letter = '';
        let index = colIndex;
        while (index >= 0) {
          temp = index % 26;
          letter = String.fromCharCode(temp + 65) + letter;
          index = Math.floor((index - temp) / 26) - 1;
        }
        return letter;
      };

      const xLetter = getLetter(xIndex);
      const yLetter = getLetter(yIndex);
      const rowCount = dataset.data.length + 1; // +1 for header

      const chart = {
        type: CHART_TYPE,
        percentages: false,
        title: { text: dataset.latestChartConfig?.title || 'Data Analysis' },
        legend: { position: 'bottom' },
        axes: [
          {
            type: 'category',
            position: 'bottom',
            // Reference X-axis labels
            categories: {
              reference: `Data!$${xLetter}$2:$${xLetter}$${rowCount}`
            }
          },
          {
            type: 'value',
            position: 'left'
          }
        ],
        series: [
          {
            name: yColName,
            // Reference Y-axis values
            data: {
              reference: `Data!$${yLetter}$2:$${yLetter}$${rowCount}`
            }
          }
        ]
      };

      // Position the chart to the right of data (starts 2 columns after data)
      const chartColStart = dataset.headers.length + 2;

      try {
        worksheet.addChart(chart, {
          tl: { col: chartColStart, row: 1 },
          ext: { width: 600, height: 400 }
        });
      } catch (chartErr) {
        console.warn("Could not add chart (exceljs might not support it):", chartErr.message);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="analysis_${dataset.fileName}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
};

// @desc Ask questions about the dataset
// @route POST /api/data/ask
exports.askQuestion = async (req, res) => {
  try {
    const { dataId, question } = req.body;

    if (!dataId || !question) {
      return res.status(400).json({
        success: false,
        message: 'dataId and question are required'
      });
    }

    const dataset = await Dataset.findById(dataId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
    }

    console.log('💬 User Question:', question);

    // Get statistics for context
    const statistics = dataProcessingService.getStatistics(
      dataset.data,
      dataset.headers
    );

    // Prepare data context
    const dataContext = {
      columns: dataset.headers,
      rowCount: dataset.data.length,
      columnTypes: dataset.columnTypes,
      statistics: statistics,
      sampleData: dataset.data.slice(0, 5)
    };

    // Get AI answer
    const result = await llmService.answerDatasetQuestion(question, dataContext);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to answer question',
        error: result.error
      });
    }

    console.log('✅ Answer generated');

    res.json({
      success: true,
      question: question,
      answer: result.answer,
      aiPowered: !result.usedFallback
    });

  } catch (error) {
    console.error('❌ Ask Question Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error answering question',
      error: error.message
    });
  }
};

exports.generateChart = async (req, res) => {
  try {
    const { dataId, question } = req.body;

    if (!dataId || !question) {
      return res.status(400).json({
        success: false,
        message: 'dataId and question are required'
      });
    }

    const dataset = await Dataset.findById(dataId);
    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found'
      });
    }

    console.log('📊 Generating chart for:', question);

    // Derive current headers from data to ensure accuracy
    const currentHeaders = dataset.data.length > 0 ? Object.keys(dataset.data[0]) : [];

    if (currentHeaders.length === 0) {
      return res.status(400).json({ success: false, message: 'Dataset is empty, cannot generate chart.' });
    }

    // Filter columnTypes to match current headers (remove stale keys)
    const validColumnTypes = {};
    if (dataset.columnTypes) {
      currentHeaders.forEach(header => {
        if (dataset.columnTypes[header]) {
          validColumnTypes[header] = dataset.columnTypes[header];
        }
      });
    }

    const chartConfig = await llmService.generateChartConfig(question, {
      columns: currentHeaders,
      columnTypes: validColumnTypes,
      sampleData: dataset.data.slice(0, 10)
    });

    if (chartConfig) {
      // Save chart config to dataset for export
      dataset.latestChartConfig = chartConfig;
      await dataset.save();

      res.json({ success: true, chart: chartConfig });
    } else {
      res.status(500).json({ success: false, message: "Could not generate chart configuration" });
    }
  } catch (error) {
    console.error('❌ Generate Chart Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating chart',
      error: error.message
    });
  }
};

// @desc Get all datasets for the logged-in user
// @route GET /api/data/history
exports.getUserDatasets = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    // Fetch datasets for the user, excluding the heavy 'data' field
    const datasets = await Dataset.find({ user: req.user._id })
      .select('-data')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: datasets.length,
      datasets: datasets
    });
  } catch (error) {
    console.error('Get User Datasets Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching history',
      error: error.message
    });
  }
};

// @desc Get a specific dataset by ID
// @route GET /api/data/:id
exports.getDataset = async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);

    if (!dataset) {
      return res.status(404).json({ success: false, message: 'Dataset not found' });
    }

    // Check ownership? Assuming if you have ID you can view it, OR enforce owner
    // if (dataset.user.toString() !== req.user.id) ...

    res.json({
      success: true,
      dataId: dataset._id,
      info: {
        fileName: dataset.fileName,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        headers: dataset.headers,
        columnTypes: dataset.columnTypes,
        preview: dataset.data.slice(0, 500) // Send a good chunk for preview or Full?
        // For Dashboard Data Table we usually need all data if it's client side paged.
        // But above we used preview 100 on upload. 
        // Let's send 500 for preview and if they need FULL table they might need another call or just this one.
        // Actually the frontend seems to expect 'preview' for the table.
        // Let's send the whole data if it's reasonable size, or paginate.
        // Given previous implementation: dataset.currentData was used. 
        // Let's attach full data as 'preview' or just 'allData'
      },
      fullData: dataset.data // Sending full data for client-side processing for now
    });

  } catch (error) {
    console.error('Get Dataset Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dataset',
      error: error.message
    });
  }
};