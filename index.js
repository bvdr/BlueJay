#!/usr/bin/env node

// Load environment variables from ~/.j/.env
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Define paths early for dotenv configuration
const J_DIR_PATH = path.join(os.homedir(), '.j');
const ENV_FILE_PATH = path.join(J_DIR_PATH, '.env');

// Configure dotenv to use the custom path
dotenv.config({ path: ENV_FILE_PATH });
const { OpenAI } = require('openai');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
let colorize;
const { exec, spawn } = require('child_process');

// Setup colorize function (defined early for error handling)
colorize = {
  blue: text => chalk.blue(text),
  green: text => chalk.green(text),
  yellow: text => chalk.yellow(text),
  red: text => chalk.red(text),
  cyan: text => chalk.cyan(text)
};

// Paths for configuration files
const LOCAL_PREFERENCES_FILE_PATH = path.join(process.cwd(), '.j-preferences');
const HOME_PREFERENCES_FILE_PATH = path.join(os.homedir(), '.j-preferences');

// Default preferences
const DEFAULT_PREFERENCES = {
  defaultModel: 'gpt-4o',
  showCommandConfirmation: true,
  colorOutput: true,
  saveCommandHistory: true,
  maxHistoryItems: 100,
  debug: false
};

// Load preferences
function loadPreferences() {
  try {
    // First try to load from current directory
    if (fs.existsSync(LOCAL_PREFERENCES_FILE_PATH)) {
      const preferencesData = fs.readFileSync(LOCAL_PREFERENCES_FILE_PATH, 'utf8');
      return JSON.parse(preferencesData);
    }
    // Then try to load from home directory
    else if (fs.existsSync(HOME_PREFERENCES_FILE_PATH)) {
      // We can't use debugLog here because preferences aren't loaded yet
      const preferencesData = fs.readFileSync(HOME_PREFERENCES_FILE_PATH, 'utf8');
      return JSON.parse(preferencesData);
    }
    // If no file exists, create one in the home directory
    else {
      fs.writeFileSync(HOME_PREFERENCES_FILE_PATH, JSON.stringify(DEFAULT_PREFERENCES, null, 2));
      return DEFAULT_PREFERENCES;
    }
  } catch (error) {
    console.error(colorize.yellow('Error loading preferences, using defaults:'), error.message);
    return DEFAULT_PREFERENCES;
  }
}

// Get preferences
const preferences = loadPreferences();

// Update colorize function based on preferences
if (!preferences.colorOutput) {
  colorize = {
    blue: text => text,
    green: text => text,
    yellow: text => text,
    red: text => text,
    cyan: text => text
  };
}

// Debug log wrapper function
function debugLog(message, color = 'blue') {
  if (preferences.debug) {
    console.log(colorize[color](`DEBUG: ${message}`));
  }
}

// Check if OpenAI API key exists, if not prompt for it
async function checkOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    console.log(colorize.yellow('OpenAI API key not found.'));

    const { apiKey } = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'Please enter your OpenAI API key:',
        validate: input => input.trim() !== '' ? true : 'API key is required'
      }
    ]);

    // Ensure the .j directory exists
    if (!fs.existsSync(J_DIR_PATH)) {
      fs.mkdirSync(J_DIR_PATH, { recursive: true });
    }

    // Save API key to .env file
    const envContent = `OPENAI_API_KEY=${apiKey}\n`;
    fs.writeFileSync(ENV_FILE_PATH, envContent);

    // Set the API key for the current session
    process.env.OPENAI_API_KEY = apiKey;

    console.log(colorize.green('API key saved successfully!'));
    console.log(colorize.blue('Your API key has been securely stored in ~/.j/.env'));
  }

  return process.env.OPENAI_API_KEY;
}

// Initialize OpenAI client
async function initOpenAI() {
  const apiKey = await checkOpenAIKey();
  return new OpenAI({ apiKey });
}

// Ask OpenAI if the input is a terminal command
async function isTerminalCommand(openai, userInput) {
  try {
    const response = await openai.chat.completions.create({
      model: preferences.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that determines if a user query is asking for a terminal command. If it is, respond ONLY with the exact command to run, with no additional text or explanation. If not, respond with "NOT_A_COMMAND".'
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      temperature: 0.2,
    });

    const content = response.choices[0].message.content;

    if (content.includes('NOT_A_COMMAND')) {
      return { isCommand: false, command: null };
    } else {
      // Extract the command from the response
      const command = content.replace(/```bash|```sh|```|\n/g, '').trim();
      return { isCommand: true, command };
    }
  } catch (error) {
    console.error(colorize.red('Error communicating with OpenAI:'), error.message);
    return { isCommand: false, command: null };
  }
}

// Check if a command is likely to be interactive
function isInteractiveCommand(command) {
  if (!command) return false;

  // Method 1: Check against known interactive commands
  const knownInteractiveCommands = ['vim', 'nano', 'emacs', 'less', 'more', 'top', 'htop', 'ssh', 'mysql', 'psql', 'python', 'node'];
  const commandName = command.split(' ')[0];

  // Method 2: Check for command flags that suggest interactivity
  const interactiveFlags = ['-i', '--interactive'];
  const hasInteractiveFlag = command.split(' ').some(part => interactiveFlags.includes(part));

  // Method 3: Check for commands that typically open a new interface or prompt
  const hasEditorPattern = /\b(edit|editor)\b/i.test(command);

  return knownInteractiveCommands.some(cmd => commandName === cmd) ||
         hasInteractiveFlag ||
         hasEditorPattern;
}

// Execute a terminal command
// We use spawn for all commands because:
// 1. It provides better handling of interactive commands that require user input
// 2. It allows for streaming output in real-time
// 3. It gives more control over stdio streams
// 4. It's more reliable for long-running processes
function executeCommand(command) {
  return new Promise((resolve, reject) => {
    // Parse the command into command name and arguments
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    // Check if the command is likely to be interactive
    const interactive = isInteractiveCommand(command);

    // Configure spawn options based on whether the command is interactive
    const spawnOptions = {
      shell: true,
      // For interactive commands: inherit all stdio to allow user interaction
      // For non-interactive commands: only inherit stderr, capture stdout
      stdio: interactive ? 'inherit' : ['inherit', 'pipe', 'inherit']
    };

    // Use debug log wrapper function
    debugLog(`Executing command "${command}"`)

    // Use spawn for all commands with appropriate configuration
    const childProcess = spawn(cmd, args, spawnOptions);

    // For non-interactive commands, we need to capture stdout
    let stdout = '';
    if (!interactive && childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    childProcess.on('close', (code) => {
      if (code === 0) {
        if (interactive) {
          resolve('Interactive command completed successfully');
        } else {
          resolve(stdout);
        }
      } else {
        reject(`Command exited with code ${code}`);
      }
    });

    childProcess.on('error', (error) => {
      reject(`Error: ${error.message}`);
    });
  });
}

// Main function
async function main() {
  try {
    // Get user input from command line arguments
    const userInput = process.argv.slice(2).join(' ');

    if (!userInput) {
      console.log(colorize.yellow('Usage: j "your request here"'));
      return;
    }

    // Initialize OpenAI
    const openai = await initOpenAI();

    // Create and start a spinner
    const spinner = ora({
      text: 'Processing your request...',
      color: 'blue'
    }).start();

    // Check if the input is asking for a terminal command
    const { isCommand, command } = await isTerminalCommand(openai, userInput);

    // Stop the spinner
    spinner.stop();

    if (isCommand && command) {
      console.log(colorize.green('I think you want to run this command:'));
      console.log(colorize.cyan(command));

      let shouldExecute = true;

      // Ask for confirmation if enabled in preferences
      if (preferences.showCommandConfirmation) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want me to execute this command?',
            default: false
          }
        ]);
        shouldExecute = confirm;
      }

      if (shouldExecute) {
        try {
          const output = await executeCommand(command);
          // For interactive commands, the output is just a success message
          // For non-interactive commands, show the actual output
          if (command && isInteractiveCommand(command)) {
            // Use debug log wrapper function for interactive command completion
            debugLog(`Interactive command "${command}" completed.`, 'green')
          } else {
            console.log(colorize.green('Command executed successfully:'));
            console.log(output);
          }
        } catch (error) {
          console.error(colorize.red('Failed to execute command:'), error);
        }
      } else {
        console.log(colorize.yellow('Command execution cancelled.'));
      }
    } else {
      console.log(colorize.yellow("I don't think you're asking for a terminal command."));
      console.log(colorize.yellow("This feature is currently being implemented."));
    }
  } catch (error) {
    console.error(colorize.red('An error occurred:'), error.message);
  }
}

// Run the main function
main();
