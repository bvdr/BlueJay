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
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const inquirer                                                                 = require('inquirer');
const { intro, outro, text, select, confirm, spinner, isCancel, cancel, note, log, password } = require('@clack/prompts');
const chalk                                                                    = require('chalk');
const ora = require('ora');
let colorize;
const { exec, spawn } = require('child_process');
const { determineToolType, runTool, TOOLS } = require('./tools');
const { checkForUpdates } = require('./utils/update-checker');
const ContextManager = require('./utils/context-manager');
const Logger = require('./utils/logger');

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
const HOME_PREFERENCES_FILE_PATH = path.join(J_DIR_PATH, '.j-preferences');

// Default preferences
const DEFAULT_PREFERENCES = {
  aiProvider: null, // Will be set during first run
  defaultModel: null, // Will be set during first run
  showCommandConfirmation: true,
  colorOutput: true,
  saveCommandHistory: true,
  maxHistoryItems: 100,
  debug: false,
  // Context settings
  enableContextMemory: true,
  contextScope: 'local', // 'local' (per folder) or 'global'
  maxContextEntries: 5,
  contextTTL: 30, // Minutes before auto-clear
  captureCommandOutput: true,
  maxOutputLength: 2000,
  // Logging settings
  enableLogging: true,
  logRetentionDays: 30 // 0 = never delete
};

// AI Provider configurations
const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic'
};

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o', recommended: true },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'o1-preview', label: 'O1 Preview' }
];

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', recommended: true },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro' }
];

const ANTHROPIC_MODELS = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', recommended: true },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
];

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
    log.error(colorize.yellow('Error loading preferences, using defaults:'), error.message);
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
    log.info(colorize[color](`DEBUG: ${message}`));
  }
}

// Check if OpenAI API key exists, if not prompt for it
async function checkOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    log.error(colorize.yellow('OpenAI API key not found.'));

    const apiKey = await password({
      message: 'Please enter your OpenAI API key:',
      validate: (value) => {
        if (!value || value.trim() === '') return 'API key is required';
      }
    });

    if (isCancel(apiKey)) {
      cancel('Setup cancelled');
      process.exit(0);
    }

    // Ensure the .j directory exists
    if (!fs.existsSync(J_DIR_PATH)) {
      fs.mkdirSync(J_DIR_PATH, { recursive: true });
    }

    // Read existing .env content
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    }

    // Add or update OpenAI API key
    if (envContent.includes('OPENAI_API_KEY=')) {
      envContent = envContent.replace(/OPENAI_API_KEY=.*\n?/, `OPENAI_API_KEY=${apiKey}\n`);
    } else {
      envContent += `OPENAI_API_KEY=${apiKey}\n`;
    }

    fs.writeFileSync(ENV_FILE_PATH, envContent);

    // Set the API key for the current session
    process.env.OPENAI_API_KEY = apiKey;

    log.success(colorize.green('API key saved successfully!'));
    log.info(colorize.blue('Your API key has been securely stored in ~/.j/.env'));
  }

  return process.env.OPENAI_API_KEY;
}

// Initialize OpenAI client
async function initOpenAI() {
  const apiKey = await checkOpenAIKey();
  return new OpenAI({ apiKey });
}

// Check if Google Gemini API key exists, if not prompt for it
async function checkGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    log.error(colorize.yellow('Google Gemini API key not found.'));

    const apiKey = await password({
      message: 'Please enter your Google Gemini API key:',
      validate: (value) => {
        if (!value || value.trim() === '') return 'API key is required';
      }
    });

    if (isCancel(apiKey)) {
      cancel('Setup cancelled');
      process.exit(0);
    }

    // Ensure the .j directory exists
    if (!fs.existsSync(J_DIR_PATH)) {
      fs.mkdirSync(J_DIR_PATH, { recursive: true });
    }

    // Read existing .env content
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    }

    // Add or update Gemini API key
    if (envContent.includes('GEMINI_API_KEY=')) {
      envContent = envContent.replace(/GEMINI_API_KEY=.*\n?/, `GEMINI_API_KEY=${apiKey}\n`);
    } else {
      envContent += `GEMINI_API_KEY=${apiKey}\n`;
    }

    fs.writeFileSync(ENV_FILE_PATH, envContent);

    // Set the API key for the current session
    process.env.GEMINI_API_KEY = apiKey;

    log.success(colorize.green('API key saved successfully!'));
    log.info(colorize.blue('Your API key has been securely stored in ~/.j/.env'));
  }

  return process.env.GEMINI_API_KEY;
}

// Initialize Google Gemini client
async function initGemini() {
  const apiKey = await checkGeminiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// Check if Anthropic API key exists, if not prompt for it
async function checkAnthropicKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    log.error(colorize.yellow('Anthropic API key not found.'));

    const apiKey = await password({
      message: 'Please enter your Anthropic API key:',
      validate: (value) => {
        if (!value || value.trim() === '') return 'API key is required';
      }
    });

    if (isCancel(apiKey)) {
      cancel('Setup cancelled');
      process.exit(0);
    }

    // Ensure the .j directory exists
    if (!fs.existsSync(J_DIR_PATH)) {
      fs.mkdirSync(J_DIR_PATH, { recursive: true });
    }

    // Read existing .env content
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    }

    // Add or update Anthropic API key
    if (envContent.includes('ANTHROPIC_API_KEY=')) {
      envContent = envContent.replace(/ANTHROPIC_API_KEY=.*\n?/, `ANTHROPIC_API_KEY=${apiKey}\n`);
    } else {
      envContent += `ANTHROPIC_API_KEY=${apiKey}\n`;
    }

    fs.writeFileSync(ENV_FILE_PATH, envContent);

    // Set the API key for the current session
    process.env.ANTHROPIC_API_KEY = apiKey;

    log.success(colorize.green('API key saved successfully!'));
    log.info(colorize.blue('Your API key has been securely stored in ~/.j/.env'));
  }

  return process.env.ANTHROPIC_API_KEY;
}

// Initialize Anthropic client
async function initAnthropic() {
  const apiKey = await checkAnthropicKey();
  return new Anthropic({ apiKey });
}

// Initialize AI client based on provider
async function initAI(provider) {
  switch (provider) {
    case AI_PROVIDERS.OPENAI:
      return await initOpenAI();
    case AI_PROVIDERS.GEMINI:
      return await initGemini();
    case AI_PROVIDERS.ANTHROPIC:
      return await initAnthropic();
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}


// First-run setup for AI provider and model selection
async function firstRunSetup() {
  intro(colorize.cyan('🐦 Welcome to BlueJay!')+" - "+colorize.blue('Your AI assistant for the terminal'));
  // Select AI provider
  const provider = await select({
    message: 'Choose your AI provider:',
    options: [
      { value: AI_PROVIDERS.OPENAI, label: 'OpenAI (GPT models)' },
      { value: AI_PROVIDERS.GEMINI, label: 'Google Gemini' },
      { value: AI_PROVIDERS.ANTHROPIC, label: 'Anthropic (Claude models)' }
    ]
  });

  if (isCancel(provider)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  // Check API key for the selected provider
  if (provider === AI_PROVIDERS.OPENAI) {
    await checkOpenAIKey();
  } else if (provider === AI_PROVIDERS.GEMINI) {
    await checkGeminiKey();
  } else if (provider === AI_PROVIDERS.ANTHROPIC) {
    await checkAnthropicKey();
  }

  // Select model based on provider
  let model;
  if (provider === AI_PROVIDERS.OPENAI) {
    model = await select({
      message: 'Choose your OpenAI model:',
      options: OPENAI_MODELS.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.recommended ? 'Recommended' : undefined
      }))
    });
  } else if (provider === AI_PROVIDERS.GEMINI) {
    model = await select({
      message: 'Choose your Google Gemini model:',
      options: GEMINI_MODELS.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.recommended ? 'Recommended' : undefined
      }))
    });
  } else if (provider === AI_PROVIDERS.ANTHROPIC) {
    model = await select({
      message: 'Choose your Anthropic Claude model:',
      options: ANTHROPIC_MODELS.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.recommended ? 'Recommended' : undefined
      }))
    });
  }

  if (isCancel(model)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  // Update preferences
  const updatedPreferences = {
    ...preferences,
    aiProvider: provider,
    defaultModel: model
  };

  // Save preferences
  fs.writeFileSync(HOME_PREFERENCES_FILE_PATH, JSON.stringify(updatedPreferences, null, 2));

  // Initialize the AI client to ensure API key is set up
  await initAI(provider);

  outro(colorize.green('✅ Setup complete! You can now use BlueJay.'));
  log.info(colorize.blue('💡 Try: j "list files in current directory"'));
  log.info(colorize.blue('💡 Use "j settings" to change your preferences anytime.'));

  return updatedPreferences;
}

// Update credentials submenu
async function updateCredentials() {
  intro(colorize.cyan('🔑 Update Credentials'));

  const credentialAction = await select({
    message: 'Which API key would you like to update?',
    options: [
      { value: 'update-openai-key', label: 'Update OpenAI API Key' },
      { value: 'update-gemini-key', label: 'Update Google Gemini API Key' },
      { value: 'update-anthropic-key', label: 'Update Anthropic API Key' },
      { value: 'back', label: '← Back to Settings' }
    ]
  });

  if (isCancel(credentialAction)) {
    cancel('Credential update cancelled');
    return 'back';
  }

  if (credentialAction === 'back') {
    return 'back';
  }

  switch (credentialAction) {
    case 'update-openai-key':
      const openaiKey = await password({
        message: 'Enter your new OpenAI API key:',
        validate: (value) => {
          if (!value || value.trim() === '') return 'API key is required';
        }
      });

      if (isCancel(openaiKey)) {
        return 'back';
      }

      // Update .env file
      let envContent = fs.existsSync(ENV_FILE_PATH) ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
      if (envContent.includes('OPENAI_API_KEY=')) {
        envContent = envContent.replace(/OPENAI_API_KEY=.*\n?/, `OPENAI_API_KEY=${openaiKey}\n`);
      } else {
        envContent += `OPENAI_API_KEY=${openaiKey}\n`;
      }
      fs.writeFileSync(ENV_FILE_PATH, envContent);
      process.env.OPENAI_API_KEY = openaiKey;
      log.success(colorize.green('OpenAI API key updated successfully!'));
      break;

    case 'update-gemini-key':
      const geminiKey = await password({
        message: 'Enter your new Google Gemini API key:',
        validate: (value) => {
          if (!value || value.trim() === '') return 'API key is required';
        }
      });

      if (isCancel(geminiKey)) {
        return 'back';
      }

      // Update .env file
      let envContent2 = fs.existsSync(ENV_FILE_PATH) ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
      if (envContent2.includes('GEMINI_API_KEY=')) {
        envContent2 = envContent2.replace(/GEMINI_API_KEY=.*\n?/, `GEMINI_API_KEY=${geminiKey}\n`);
      } else {
        envContent2 += `GEMINI_API_KEY=${geminiKey}\n`;
      }
      fs.writeFileSync(ENV_FILE_PATH, envContent2);
      process.env.GEMINI_API_KEY = geminiKey;
      log.success(colorize.green('Google Gemini API key updated successfully!'));
      break;

    case 'update-anthropic-key':
      const anthropicKey = await password({
        message: 'Enter your new Anthropic API key:',
        validate: (value) => {
          if (!value || value.trim() === '') return 'API key is required';
        }
      });

      if (isCancel(anthropicKey)) {
        return 'back';
      }

      // Update .env file
      let envContent3 = fs.existsSync(ENV_FILE_PATH) ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
      if (envContent3.includes('ANTHROPIC_API_KEY=')) {
        envContent3 = envContent3.replace(/ANTHROPIC_API_KEY=.*\n?/, `ANTHROPIC_API_KEY=${anthropicKey}\n`);
      } else {
        envContent3 += `ANTHROPIC_API_KEY=${anthropicKey}\n`;
      }
      fs.writeFileSync(ENV_FILE_PATH, envContent3);
      process.env.ANTHROPIC_API_KEY = anthropicKey;
      log.success(colorize.green('Anthropic API key updated successfully!'));
      break;
  }

  outro(colorize.green('Credentials updated!'));
  return 'continue';
}

// Preferences management with checkboxes
async function managePreferences() {
  intro(colorize.cyan('⚙️  Preferences'));

  const currentPreferences = [
    {
      name: 'showCommandConfirmation',
      message: 'Command Confirmation',
      checked: preferences.showCommandConfirmation
    },
    {
      name: 'colorOutput',
      message: 'Colored Output',
      checked: preferences.colorOutput
    },
    {
      name: 'debug',
      message: 'Debug Mode',
      checked: preferences.debug
    }
  ];

  const selectedPreferences = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'preferences',
      message: 'Select your preferences:',
      choices: currentPreferences.map(pref => ({
        name: pref.message,
        value: pref.name,
        checked: pref.checked
      }))
    }
  ]);

  // Update preferences based on selections
  const updatedPreferences = { ...preferences };

  // Set all preferences to false first
  updatedPreferences.showCommandConfirmation = false;
  updatedPreferences.colorOutput = false;
  updatedPreferences.debug = false;

  // Then set selected ones to true
  selectedPreferences.preferences.forEach(prefName => {
    updatedPreferences[prefName] = true;
  });

  // Save updated preferences
  fs.writeFileSync(HOME_PREFERENCES_FILE_PATH, JSON.stringify(updatedPreferences, null, 2));
  log.success(colorize.green('Preferences updated successfully!'));

  outro(colorize.green('Preferences saved!'));

  return updatedPreferences;
}

// Context settings management
async function manageContextSettings() {
  intro(colorize.cyan('📝 Context & History Settings'));

  while (true) {
    const action = await select({
      message: 'Configure context and logging:',
      options: [
        {
          value: 'toggle-context',
          label: `${preferences.enableContextMemory ? '✓' : '✗'} Enable Context Memory`
        },
        {
          value: 'context-scope',
          label: `Context Scope: ${preferences.contextScope} ${preferences.contextScope === 'local' ? '(per folder)' : '(global)'}`
        },
        {
          value: 'context-ttl',
          label: `Auto-clear after: ${preferences.contextTTL} minutes`
        },
        {
          value: 'max-entries',
          label: `Max context entries: ${preferences.maxContextEntries}`
        },
        {
          value: 'toggle-output-capture',
          label: `${preferences.captureCommandOutput ? '✓' : '✗'} Capture Command Output`
        },
        {
          value: 'toggle-logging',
          label: `${preferences.enableLogging ? '✓' : '✗'} Enable Permanent Logging`
        },
        {
          value: 'log-retention',
          label: `Log retention: ${preferences.logRetentionDays} days ${preferences.logRetentionDays === 0 ? '(never delete)' : ''}`
        },
        { value: 'back', label: '← Back to Settings' }
      ]
    });

    if (isCancel(action)) {
      outro(colorize.green('Context settings closed'));
      return preferences;
    }

    if (action === 'back') {
      outro(colorize.green('Context settings saved'));
      return preferences;
    }

    const updatedPreferences = { ...preferences };

    switch (action) {
      case 'toggle-context':
        updatedPreferences.enableContextMemory = !preferences.enableContextMemory;
        log.info(colorize.cyan(`Context memory ${updatedPreferences.enableContextMemory ? 'enabled' : 'disabled'}`));
        break;

      case 'context-scope':
        const scope = await select({
          message: 'Choose context scope:',
          options: [
            { value: 'local', label: 'Local (per folder) - Context is specific to each directory' },
            { value: 'global', label: 'Global - Context persists across all directories' }
          ]
        });

        if (!isCancel(scope)) {
          updatedPreferences.contextScope = scope;
          log.info(colorize.cyan(`Context scope set to ${scope}`));
        }
        break;

      case 'context-ttl':
        const ttl = await text({
          message: 'Auto-clear context after how many minutes? (0 = never)',
          initialValue: String(preferences.contextTTL),
          validate: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 0) {
              return 'Please enter a valid number (0 or greater)';
            }
          }
        });

        if (!isCancel(ttl)) {
          updatedPreferences.contextTTL = parseInt(ttl);
          log.info(colorize.cyan(`Context TTL set to ${ttl} minutes`));
        }
        break;

      case 'max-entries':
        const maxEntries = await text({
          message: 'Maximum context entries to keep:',
          initialValue: String(preferences.maxContextEntries),
          validate: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 1 || num > 20) {
              return 'Please enter a number between 1 and 20';
            }
          }
        });

        if (!isCancel(maxEntries)) {
          updatedPreferences.maxContextEntries = parseInt(maxEntries);
          log.info(colorize.cyan(`Max context entries set to ${maxEntries}`));
        }
        break;

      case 'toggle-output-capture':
        updatedPreferences.captureCommandOutput = !preferences.captureCommandOutput;
        log.info(colorize.cyan(`Output capture ${updatedPreferences.captureCommandOutput ? 'enabled' : 'disabled'}`));
        break;

      case 'toggle-logging':
        updatedPreferences.enableLogging = !preferences.enableLogging;
        log.info(colorize.cyan(`Logging ${updatedPreferences.enableLogging ? 'enabled' : 'disabled'}`));
        break;

      case 'log-retention':
        const retention = await text({
          message: 'Keep logs for how many days? (0 = never delete)',
          initialValue: String(preferences.logRetentionDays),
          validate: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 0) {
              return 'Please enter a valid number (0 or greater)';
            }
          }
        });

        if (!isCancel(retention)) {
          updatedPreferences.logRetentionDays = parseInt(retention);
          log.info(colorize.cyan(`Log retention set to ${retention} days`));
        }
        break;
    }

    // Save updated preferences
    if (JSON.stringify(updatedPreferences) !== JSON.stringify(preferences)) {
      fs.writeFileSync(HOME_PREFERENCES_FILE_PATH, JSON.stringify(updatedPreferences, null, 2));
      Object.assign(preferences, updatedPreferences);
      log.success(colorize.green('Settings saved!'));
    }
  }
}

// Settings management
async function showSettings() {
  while (true) {
    intro(colorize.cyan('⚙️  BlueJay Settings'));

    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'change-provider', label: `AI Provider: ${preferences.aiProvider || 'Not set'}` },
        { value: 'change-model', label: `Model: ${preferences.defaultModel || 'Not set'}` },
        { value: 'update-credentials', label: 'Update Credentials' },
        { value: 'preferences', label: 'Preferences' },
        { value: 'context-settings', label: 'Context & History Settings' },
        { value: 'view-current', label: 'View Current Settings' },
        { value: 'exit', label: '← Exit Settings' }
      ]
    });

    if (isCancel(action)) {
      cancel('Settings cancelled');
      return;
    }

    if (action === 'exit') {
      outro(colorize.green('Settings closed'));
      return;
    }

    let updatedPreferences = { ...preferences };

    switch (action) {
      case 'change-provider':
        const newProvider = await select({
          message: 'Choose your AI provider:',
          options: [
            { value: AI_PROVIDERS.OPENAI, label: 'OpenAI (GPT models)' },
            { value: AI_PROVIDERS.GEMINI, label: 'Google Gemini' },
            { value: AI_PROVIDERS.ANTHROPIC, label: 'Anthropic (Claude models)' }
          ]
        });

        if (isCancel(newProvider)) {
          continue; // Go back to settings menu
        }

        updatedPreferences.aiProvider = newProvider;
        // Reset model when changing provider
        updatedPreferences.defaultModel = null;

        // Check API key for the selected provider
        if (newProvider === AI_PROVIDERS.OPENAI) {
          await checkOpenAIKey();
        } else if (newProvider === AI_PROVIDERS.GEMINI) {
          await checkGeminiKey();
        } else if (newProvider === AI_PROVIDERS.ANTHROPIC) {
          await checkAnthropicKey();
        }

        // Immediately prompt for model selection after provider change
        let models;
        let providerLabel;

        if (newProvider === AI_PROVIDERS.OPENAI) {
          models = OPENAI_MODELS;
          providerLabel = 'OpenAI';
        } else if (newProvider === AI_PROVIDERS.GEMINI) {
          models = GEMINI_MODELS;
          providerLabel = 'Google Gemini';
        } else if (newProvider === AI_PROVIDERS.ANTHROPIC) {
          models = ANTHROPIC_MODELS;
          providerLabel = 'Anthropic Claude';
        }

        const newModel = await select({
          message: `Choose your ${providerLabel} model:`,
          options: models.map(m => ({
            value: m.value,
            label: m.label,
            hint: m.recommended ? 'Recommended' : undefined
          }))
        });

        if (!isCancel(newModel)) {
          updatedPreferences.defaultModel = newModel;
        }
        break;

      case 'change-model':
        let models2;
        let providerLabel2;

        if (preferences.aiProvider === AI_PROVIDERS.OPENAI) {
          models2 = OPENAI_MODELS;
          providerLabel2 = 'OpenAI';
        } else if (preferences.aiProvider === AI_PROVIDERS.GEMINI) {
          models2 = GEMINI_MODELS;
          providerLabel2 = 'Google Gemini';
        } else if (preferences.aiProvider === AI_PROVIDERS.ANTHROPIC) {
          models2 = ANTHROPIC_MODELS;
          providerLabel2 = 'Anthropic Claude';
        }

        const newModel2 = await select({
          message: `Choose your ${providerLabel2} model:`,
          options: models2.map(m => ({
            value: m.value,
            label: m.label,
            hint: m.recommended ? 'Recommended' : undefined
          }))
        });

        if (isCancel(newModel2)) {
          continue; // Go back to settings menu
        }

        updatedPreferences.defaultModel = newModel2;
        break;

      case 'update-credentials':
        const credResult = await updateCredentials();
        if (credResult === 'back') {
          continue; // Go back to settings menu
        }
        break;

      case 'preferences':
        updatedPreferences = await managePreferences();
        break;

      case 'context-settings':
        updatedPreferences = await manageContextSettings();
        break;

      case 'view-current':
        log.info(colorize.blue('\n📋 Current Settings:'));
        log.info(colorize.cyan(`AI Provider: ${preferences.aiProvider || 'Not set'}`));
        log.info(colorize.cyan(`Default Model: ${preferences.defaultModel || 'Not set'}`));
        log.info(colorize.blue('\nPreferences:'));
        log.info(colorize.cyan(`│  ${preferences.showCommandConfirmation ? '●' : '○'} Command Confirmation`));
        log.info(colorize.cyan(`│  ${preferences.colorOutput ? '●' : '○'} Colored Output`));
        log.info(colorize.cyan(`│  ${preferences.debug ? '●' : '○'} Debug Mode`));
        break;
    }

    // Save updated preferences if they changed
    if (JSON.stringify(updatedPreferences) !== JSON.stringify(preferences)) {
      fs.writeFileSync(HOME_PREFERENCES_FILE_PATH, JSON.stringify(updatedPreferences, null, 2));
      // Update the global preferences object
      Object.assign(preferences, updatedPreferences);
    }

    outro(colorize.green('Settings updated!'));
  }
}

// Ask AI if the input is a terminal command (works with both OpenAI and Gemini)
async function isTerminalCommand(aiClient, userInput, provider, defaultModel, contextMessages = []) {
  try {
    const systemPrompt = 'You are a helpful assistant that runs in a terminal on a MAC OS/LINUX. Your primary goal is to interpret user input as terminal commands whenever possible. Be very liberal in your interpretation - if there is any way the user\'s request could be fulfilled with a terminal command, provide that command. Even if the request is ambiguous or could be interpreted in multiple ways, prefer to respond with a command rather than "NOT_A_COMMAND". If you provide a command, respond ONLY with the command to run, with no additional text or explanation. Only respond with "NOT_A_COMMAND" if the user\'s input is clearly not related to any possible terminal operation or file system task.';

    let content;

    if (provider === AI_PROVIDERS.OPENAI) {
      // Build messages array with context
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...contextMessages,
        {
          role: 'user',
          content: userInput
        }
      ];

      const response = await aiClient.chat.completions.create({
        model: defaultModel,
        messages,
        temperature: 0.2,
      });
      content = response.choices[0].message.content;
    } else if (provider === AI_PROVIDERS.GEMINI) {
      // Gemini doesn't support message arrays in the same way, so build a text prompt with context
      const modelName = defaultModel || 'gemini-2.5-flash';
      const model = aiClient.getGenerativeModel({ model: modelName });

      let prompt = systemPrompt;

      // Add context as conversation history
      if (contextMessages.length > 0) {
        prompt += '\n\nPrevious conversation:';
        contextMessages.forEach(msg => {
          prompt += `\n${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`;
        });
      }

      prompt += `\n\nUser: ${userInput}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      content = response.text();
    } else if (provider === AI_PROVIDERS.ANTHROPIC) {
      // Build messages array with context
      const messages = [
        ...contextMessages,
        {
          role: 'user',
          content: userInput
        }
      ];

      const response = await aiClient.messages.create({
        model: defaultModel,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        temperature: 0.2,
      });
      content = response.content[0].text;
    }

    if (content.includes('NOT_A_COMMAND')) {
      return { isCommand: false, command: null };
    } else {
      // Extract the command from the response
      const command = content.replace(/```bash|```sh|```|\n/g, '').trim();
      return { isCommand: true, command };
    }
  } catch (error) {
    log.error(colorize.red(`Error communicating with ${provider}:`), error.message);
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

// Function to detect current shell and return history file path
function getShellHistoryPath() {
  const shell = process.env.SHELL || '/bin/bash';
  const shellName = path.basename(shell);
  const homeDir = os.homedir();

  switch (shellName) {
    case 'zsh':
      return path.join(homeDir, '.zsh_history');
    case 'bash':
      return path.join(homeDir, '.bash_history');
    case 'fish':
      return path.join(homeDir, '.local/share/fish/fish_history');
    default:
      // Default to bash history for unknown shells
      return path.join(homeDir, '.bash_history');
  }
}

// Function to add command to shell history
function addToShellHistory(command) {
  if (!preferences.saveCommandHistory) {
    return;
  }

  try {
    const historyPath = getShellHistoryPath();
    const shell = process.env.SHELL || '/bin/bash';
    const shellName = path.basename(shell);

    let historyEntry;
    const timestamp = Math.floor(Date.now() / 1000);

    switch (shellName) {
      case 'zsh':
        // Zsh history format: : timestamp:0;command
        historyEntry = `: ${timestamp}:0;${command}\n`;
        break;
      case 'fish':
        // Fish history format is YAML-like
        historyEntry = `- cmd: ${command}\n  when: ${timestamp}\n`;
        break;
      case 'bash':
      default:
        // Bash history format: just the command
        historyEntry = `${command}\n`;
        break;
    }

    // Append to history file
    fs.appendFileSync(historyPath, historyEntry);
    debugLog(`Added command to ${shellName} history: ${command}`, 'green');

  } catch (error) {
    debugLog(`Failed to add command to history: ${error.message}`, 'red');
  }
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
      // For non-interactive commands: capture both stdout and stderr
      stdio: interactive ? 'inherit' : ['inherit', 'pipe', 'pipe']
    };

    // Use debug log wrapper function
    debugLog(`Executing command "${command}"`)

    // Use spawn for all commands with appropriate configuration
    const childProcess = spawn(cmd, args, spawnOptions);

    // Capture stdout and stderr for non-interactive commands
    let stdout = '';
    let stderr = '';

    if (!interactive) {
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          // Also print to user in real-time
          process.stdout.write(output);
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          // Also print to user in real-time
          process.stderr.write(output);
        });
      }
    }

    childProcess.on('close', (code) => {
      if (interactive) {
        // For interactive commands, return minimal info
        resolve({
          output: null,
          error: null,
          exitCode: code,
          interactive: true
        });
      } else {
        // For non-interactive commands, return captured output
        resolve({
          output: stdout.trim(),
          error: stderr.trim() || null,
          exitCode: code,
          interactive: false
        });
      }
    });

    childProcess.on('error', (error) => {
      reject({
        output: null,
        error: error.message,
        exitCode: 1,
        interactive: false
      });
    });
  });
}

// Show welcome message
function showWelcomeMessage() {
  console.log('');
  note(
    `${colorize.blue('Welcome to BlueJay!')} 🐦 v${CURRENT_VERSION}

Your AI-powered terminal assistant.

${colorize.cyan('GET STARTED')}
  Run: ${colorize.green('j settings')}

This will help you:
  • Choose your AI provider (OpenAI, Gemini, or Anthropic)
  • Select your preferred model
  • Configure your API key
  • Set your preferences

${colorize.cyan('LEARN MORE')}
  Run: ${colorize.green('j --help')}`,
    'Getting Started'
  );
  console.log('');
}

// Show enhanced empty command help
function showEmptyCommandHelp() {
  console.log('');

  if (!preferences.aiProvider || !preferences.defaultModel) {
    // Unconfigured state - guide to setup
    note(
      `${colorize.blue('Welcome to BlueJay!')} 🐦

Your AI-powered terminal assistant.

${colorize.cyan('GET STARTED')}
  Run: ${colorize.green('j settings')}

This will help you:
  • Choose your AI provider (OpenAI, Gemini, or Anthropic)
  • Select your preferred model
  • Configure your API key
  • Set your preferences

${colorize.cyan('LEARN MORE')}
  Run: ${colorize.green('j --help')}`,
      'Getting Started'
    );
  } else {
    // Configured state - show quick reference
    note(
      `${colorize.green('Ready to assist!')} 🐦

${colorize.cyan('CURRENT SETUP')}
  Provider: ${preferences.aiProvider}
  Model: ${preferences.defaultModel}

${colorize.cyan('TRY THESE COMMANDS')}
  ${colorize.green('j "list files in current directory"')}
  ${colorize.green('j "show system information"')}
  ${colorize.green('j "find all .js files"')}
  ${colorize.green('j "create a directory called projects"')}

${colorize.cyan('QUICK REFERENCE')}
  ${colorize.blue('j settings')}  - Configure provider and preferences
  ${colorize.blue('j --help')}    - View full documentation`,
      'BlueJay CLI'
    );
  }

  console.log('');
}

// Get package version
const packageJson = require('./package.json');
const CURRENT_VERSION = packageJson.version;

// Show update notification if available
async function showUpdateNotification() {
  try {
    const { updateAvailable, latestVersion } = await checkForUpdates(CURRENT_VERSION);

    if (updateAvailable && latestVersion) {
      console.log('');
      log.info(colorize.yellow(`🐦 A new BlueJay has arrived! ${CURRENT_VERSION} → ${latestVersion}`));
      log.info(colorize.cyan(`   Run: npm install -g @bvdr/bluejay@latest`));
      console.log('');
    }
  } catch (error) {
    // Silently fail - don't interrupt user's workflow
  }
}

// Show help information
function showHelp() {
  const version = CURRENT_VERSION;

  console.log('');
  note(
    `${colorize.blue('BlueJay CLI')} - AI-powered terminal assistant v${version}

${colorize.cyan('USAGE')}
  j "your natural language request"
  j settings              Configure AI provider and preferences
  j show-context          View current conversation context
  j clear-context         Clear conversation history
  j show-logs             View today's command logs
  j --help | -h | help    Show this help screen

${colorize.cyan('EXAMPLES')}
  j "list files in current directory"
  j "find all .js files modified in last week"
  j "show system information"
  j "create a new directory called projects"
  j "search for 'TODO' in all files"

${colorize.cyan('CONTEXT MEMORY')}
  BlueJay remembers previous commands and their outputs in the same folder.
  Use follow-up requests like "make it admin" or "fix that error".
  Context auto-clears after 30 minutes (configurable in settings).

${colorize.cyan('CONFIGURATION')}`,
    'Help'
  );

  // Show current configuration if it exists
  if (preferences.aiProvider && preferences.defaultModel) {
    log.info(colorize.green('Current Setup:'));
    log.info(colorize.cyan(`  Provider: ${preferences.aiProvider}`));
    log.info(colorize.cyan(`  Model: ${preferences.defaultModel}`));
    log.info(colorize.cyan(`  Command Confirmation: ${preferences.showCommandConfirmation ? 'Enabled' : 'Disabled'}`));
    log.info(colorize.cyan(`  Colored Output: ${preferences.colorOutput ? 'Enabled' : 'Disabled'}`));
    log.info('');
  } else {
    log.info(colorize.yellow('  Not configured yet - run "j settings" to get started'));
    log.info('');
  }

  // API Key Resources
  note(
    `${colorize.cyan('API KEY RESOURCES')}
  OpenAI:    https://platform.openai.com/api-keys
  Gemini:    https://aistudio.google.com/app/apikey
  Anthropic: https://console.anthropic.com/settings/keys

${colorize.cyan('SETTINGS MANAGEMENT')}
  Run "j settings" to:
  • Change AI provider (OpenAI / Gemini / Anthropic)
  • Select different models
  • Update API keys
  • Toggle command confirmation
  • Enable/disable colored output
  • Configure context memory (scope, TTL, max entries)
  • Configure logging and history retention
  • Configure debug mode`,
    'Resources'
  );

  console.log('');
}

// Main function
async function main() {
  try {
    // Check for updates asynchronously (non-blocking)
    showUpdateNotification().catch(() => {
      // Silently ignore errors
    });

    // Get user input from command line arguments
    let userInput = process.argv.slice(2).join(' ');

    // Check for version flag
    if (userInput === '-v' || userInput === '--version') {
      console.log(CURRENT_VERSION);
      return;
    }

    // Check for help flag
    if (userInput === '--help' || userInput === '-h' || userInput === 'help') {
      showHelp();
      return;
    }

    // Check for settings command
    if (userInput === 'settings') {
      // Check if this is first run (no AI provider configured)
      if (!preferences.aiProvider || !preferences.defaultModel) {
        const setupPreferences = await firstRunSetup();
        // Update global preferences with the setup results
        Object.assign(preferences, setupPreferences);
        // Exit after setup instead of showing settings
        return;
      } else {
        await showSettings();
      }
      return;
    }

    // Check for context commands
    if (userInput === 'show-context' || userInput === '--show-context') {
      const contextManager = new ContextManager(preferences);
      const formattedContext = contextManager.getFormattedContext();
      console.log('');
      console.log(colorize.cyan('=== Current Context ==='));
      console.log(formattedContext);
      return;
    }

    if (userInput === 'clear-context' || userInput === '--clear-context') {
      const contextManager = new ContextManager(preferences);
      contextManager.clearContext();
      log.success(colorize.green('Context cleared successfully'));
      return;
    }

    if (userInput === 'show-logs' || userInput === '--show-logs') {
      const logger = new Logger(preferences);
      const formattedLogs = logger.getFormattedLogs();
      console.log('');
      console.log(colorize.cyan('=== Today\'s Logs ==='));
      console.log(formattedLogs);
      return;
    }

    if (!userInput) {
      showEmptyCommandHelp();
      return;
    }

    // Check if this is first run (no AI provider configured)
    let currentPreferences = preferences;
    if (!currentPreferences.aiProvider || !currentPreferences.defaultModel) {
      currentPreferences = await firstRunSetup();
      // Update global preferences with the setup results
      Object.assign(preferences, currentPreferences);
    }

    // Initialize AI client based on configured provider
    const aiClient = await initAI(currentPreferences.aiProvider);

    // Create a spinner (but don't start it yet)
    const spinner = ora({
      text: 'Processing your request...',
      color: 'blue'
    });

    // Start the spinner for tool type determination
    spinner.start();

    // Determine which tool to use
    const toolType = await determineToolType(aiClient, userInput, currentPreferences.aiProvider, currentPreferences.defaultModel);

    // Stop the spinner
    spinner.stop();

    debugLog(`Determined tool type: ${toolType}`, 'blue');

    // Initialize context manager and logger
    const contextManager = new ContextManager(currentPreferences);
    const logger = new Logger(currentPreferences);

    // Load existing context if enabled
    const contextMessages = currentPreferences.enableContextMemory
      ? contextManager.getMessagesForAI()
      : [];

    // Run the appropriate tool
    if (toolType === TOOLS.TERMINAL) {
      // For terminal commands, we still need to get the exact command
      const { isCommand, command } = await isTerminalCommand(
        aiClient,
        userInput,
        currentPreferences.aiProvider,
        currentPreferences.defaultModel,
        contextMessages
      );

      if (isCommand && command) {
        log.step(colorize.green('I think you want to run this command:'));
        log.info(colorize.cyan(command));

        // Add to context before confirmation
        if (currentPreferences.enableContextMemory) {
          contextManager.addInteraction(userInput, command);
        }

        let shouldExecute = true;

        // Ask for confirmation if enabled in preferences
        if (currentPreferences.showCommandConfirmation) {
          const shouldConfirm = await confirm({
            message: 'Do you want me to execute this command?',
            initialValue: false
          });

          if (isCancel(shouldConfirm)) {
            cancel('Command execution cancelled');
            return;
          }

          shouldExecute = shouldConfirm;
        }

        if (shouldExecute) {
          try {
            const result = await executeCommand(command);

            // Update context with execution results
            if (currentPreferences.enableContextMemory) {
              contextManager.updateLastInteraction({
                executed: true,
                output: result.output,
                error: result.error,
                exitCode: result.exitCode
              });
            }

            // Log to permanent file
            logger.log({
              userInput,
              command,
              executed: true,
              result
            });

            // Add command to shell history after successful execution
            addToShellHistory(command);

            // Display results to user
            if (result.interactive) {
              // Use debug log wrapper function for interactive command completion
              debugLog(`Interactive command "${command}" completed.`, 'green')
            } else {
              if (result.exitCode === 0) {
                log.success(colorize.green('Command executed successfully'));
                // Output was already printed in real-time, no need to print again
              } else {
                log.warn(colorize.yellow(`Command exited with code ${result.exitCode}`));
              }
            }
          } catch (error) {
            // Log error
            logger.log({
              userInput,
              command,
              executed: true,
              error: error.error || error.message
            });

            log.error(colorize.red('Failed to execute command:'), error.error || error.message);
          }
        } else {
          log.warn(colorize.yellow('Command execution cancelled.'));

          // Log the cancellation
          logger.log({
            userInput,
            command,
            executed: false
          });
        }
      } else {
        log.warn(colorize.yellow("I couldn't determine the exact command to run."));
      }
    } else {
      log.warn(colorize.yellow("I'm not sure what tool to use for your request."));
      log.info(colorize.yellow("Available tools:"));
      log.info(colorize.cyan("1. Terminal - for executing terminal commands"));
    }
  } catch (error) {
    log.error(colorize.red('An error occurred:'), error.message);
  }
}

// Export for postinstall script
module.exports = { showWelcomeMessage };

// Run the main function
main();
