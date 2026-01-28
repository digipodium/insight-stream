const mongoose = require('mongoose');

const promptLogSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        type: {
            type: String,
            enum: ['chat', 'chart', 'process', 'ask', 'other'],
            default: 'other',
        },
        prompt: {
            type: String,
            required: true,
        },
        tokensUsed: {
            type: Number,
            default: 0
        },
        metadata: {
            type: Object
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('PromptLog', promptLogSchema);
