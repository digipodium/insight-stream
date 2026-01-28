const PromptLog = require('../models/PromptLog');

const logPrompt = async (userId, type, prompt, tokensUsed = 0, metadata = {}) => {
    try {
        await PromptLog.create({
            user: userId,
            type,
            prompt,
            tokensUsed,
            metadata
        });
    } catch (error) {
        console.error('Failed to log prompt:', error);
        // Don't throw, just log error so main flow isn't interrupted
    }
};

module.exports = { logPrompt };
