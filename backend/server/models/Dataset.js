const mongoose = require('mongoose');

const datasetSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        fileName: {
            type: String,
            required: [true, 'Please add a file name'],
        },
        rowCount: {
            type: Number,
        },
        columnCount: {
            type: Number,
        },
        headers: {
            type: [String],
        },
        columnTypes: {
            type: Object,
        },
        data: {
            type: Array, // Store the actual dataset rows
            required: true,
        },
        insights: {
            type: Array, // Generated insights
            default: [],
        },
        latestChartConfig: {
            type: Object, // Store the last chart configuration
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Dataset', datasetSchema);
