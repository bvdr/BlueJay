// Tools management for BlueJay CLI
const inquirer = require('inquirer');
const chalk = require('chalk');
const { log } = require('@clack/prompts');

// Available tools
const TOOLS = {
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown'
};

// AI Provider configurations (imported from main)
const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini'
};

// Determine which tool to use based on user input (works with both OpenAI and Gemini)
async function determineToolType(aiClient, userInput, provider) {
  try {
    const systemPrompt = `You are a helpful assistant that determines which tool a user wants to use based on their input.
Available tools:
1. Terminal - for executing terminal commands

If the user is asking to execute a terminal command, respond with "TOOL:TERMINAL".
If you're unsure or the request doesn't match any tool, respond with "TOOL:UNKNOWN".
Respond ONLY with the tool identifier, no additional text.`;

    let content;

    if (provider === AI_PROVIDERS.OPENAI) {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-4o', // Default model, will be overridden by preferences
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userInput
          }
        ],
        temperature: 0.2,
      });
      content = response.choices[0].message.content.trim();
    } else if (provider === AI_PROVIDERS.GEMINI) {
      // Use a default model if preferences aren't available
      const modelName = 'gemini-2.5-flash'; // Updated default model
      const model = aiClient.getGenerativeModel({ model: modelName });
      const prompt = `${systemPrompt}\n\nUser: ${userInput}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      content = response.text().trim();
    }

    if (content.includes('TOOL:TERMINAL')) {
      return TOOLS.TERMINAL;
    } else {
      return TOOLS.UNKNOWN;
    }
  } catch (error) {
    log.error(chalk.red(`Error determining tool type with ${provider}:`), error.message);
    return TOOLS.UNKNOWN;
  }
}


// Run the appropriate tool based on the determined type
async function runTool(toolType, openai, userInput) {
  switch (toolType) {
    case TOOLS.TERMINAL:
      // Use the existing isTerminalCommand function
      return { isCommand: true, command: null, userInput };

    case TOOLS.UNKNOWN:
    default:
      return { isCommand: false, command: null, toolExecuted: false };
  }
}

module.exports = {
  TOOLS,
  determineToolType,
  runTool
};
