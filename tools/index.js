// Tools management for Jarvis CLI
const inquirer = require('inquirer');
const chalk = require('chalk');
const { runGitHubTool } = require('./github');
const { runAgenticTool } = require('./agentic');

// Available tools
const TOOLS = {
  TERMINAL: 'terminal',
  GITHUB: 'github',
  AGENTIC: 'agentic',
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
2. GitHub - for interacting with GitHub (organizations, repositories, pull requests)
3. Agentic - for performing a chain of actions with planning and execution (use when the user wants to perform a complex task that requires multiple steps)

If the user is asking to execute a terminal command, respond with "TOOL:TERMINAL".
If the user is asking to interact with GitHub (view organizations, repositories, PRs), respond with "TOOL:GITHUB".
If the user is asking to perform a complex task with multiple steps or mentions using an agent, respond with "TOOL:AGENTIC".
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
    } else if (content.includes('TOOL:GITHUB')) {
      return TOOLS.GITHUB;
    } else if (content.includes('TOOL:AGENTIC')) {
      return TOOLS.AGENTIC;
    } else {
      return TOOLS.UNKNOWN;
    }
  } catch (error) {
    console.error(chalk.red('Error determining tool type:'), error.message);
    return TOOLS.UNKNOWN;
  }
}

// Check if GitHub token exists, if not prompt for it
async function checkGitHubToken() {
  // Check if GitHub token is in environment variables
  if (!process.env.GITHUB_TOKEN) {
    console.log(chalk.yellow('GitHub token not found.'));

    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Please enter your GitHub personal access token:',
        validate: input => input.trim() !== '' ? true : 'GitHub token is required'
      }
    ]);

    // Save token to environment variables for this session
    process.env.GITHUB_TOKEN = token;

    // Update the .env file to include the GitHub token
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const J_DIR_PATH = path.join(os.homedir(), '.j');
    const ENV_FILE_PATH = path.join(J_DIR_PATH, '.env');

    // Read existing .env file
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    }

    // Check if GITHUB_TOKEN already exists in the file
    if (!envContent.includes('GITHUB_TOKEN=')) {
      // Append the GitHub token
      envContent += `\nGITHUB_TOKEN=${token}\n`;
      fs.writeFileSync(ENV_FILE_PATH, envContent);
      console.log(chalk.green('GitHub token saved successfully!'));
    }
  }

  return process.env.GITHUB_TOKEN;
}

// Run the appropriate tool based on the determined type
async function runTool(toolType, openai, userInput) {
  switch (toolType) {
    case TOOLS.TERMINAL:
      // Use the existing isTerminalCommand function
      return { isCommand: true, command: null, userInput };

    case TOOLS.GITHUB:
      try {
        const token = await checkGitHubToken();
        await runGitHubTool(token);
        return { isCommand: false, command: null, toolExecuted: true };
      } catch (error) {
        console.error(chalk.red('Error running GitHub tool:'), error.message);
        return { isCommand: false, command: null, toolExecuted: false, error: error.message };
      }

    case TOOLS.AGENTIC:
      try {
        await runAgenticTool(openai, userInput);
        return { isCommand: false, command: null, toolExecuted: true };
      } catch (error) {
        console.error(chalk.red('Error running Agentic tool:'), error.message);
        return { isCommand: false, command: null, toolExecuted: false, error: error.message };
      }

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
