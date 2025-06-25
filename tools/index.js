// Tools management for Jarvis CLI
const inquirer = require('inquirer');
const chalk = require('chalk');

// Available tools
const TOOLS = {
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown'
};

// Determine which tool to use based on user input
async function determineToolType(openai, userInput) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that determines which tool a user wants to use based on their input.
Available tools:
1. Terminal - for executing terminal commands

If the user is asking to execute a terminal command, respond with "TOOL:TERMINAL".
If you're unsure or the request doesn't match any tool, respond with "TOOL:UNKNOWN".
Respond ONLY with the tool identifier, no additional text.`
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      temperature: 0.2,
    });

    const content = response.choices[0].message.content.trim();

    if (content.includes('TOOL:TERMINAL')) {
      return TOOLS.TERMINAL;
    } else {
      return TOOLS.UNKNOWN;
    }
  } catch (error) {
    console.error(chalk.red('Error determining tool type:'), error.message);
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
