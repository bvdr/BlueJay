#!/usr/bin/env node

// Load environment variables from ~/.j/.env
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// Define paths early for dotenv configuration
const J_DIR_PATH = path.join(os.homedir(), '.j');
const ENV_FILE_PATH = path.join(J_DIR_PATH, '.env');

// Configure dotenv to use the custom path
dotenv.config({ path: ENV_FILE_PATH });
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const inquirer                                                                 = require('inquirer');
const { intro, outro, text, select, confirm, spinner, isCancel, cancel, note, log } = require('@clack/prompts');
const chalk                                                                    = require('chalk');
const ora = require('ora');
let colorize;
const { exec, spawn } = require('child_process');
const { determineToolType, runTool, TOOLS } = require('./tools');

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
  debug: false
};

// AI Provider configurations
const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini'
};

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o', recommended: true },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
];

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', recommended: true },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-light', label: 'Gemini 2.0 Flash Light' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gemini-pro', label: 'Gemini Pro' },
  { value: 'custom', label: 'Custom Model (Enter manually)' }
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

    const apiKey = await text({
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

    const apiKey = await text({
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

// Initialize AI client based on provider
async function initAI(provider) {
  switch (provider) {
    case AI_PROVIDERS.OPENAI:
      return await initOpenAI();
    case AI_PROVIDERS.GEMINI:
      return await initGemini();
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

// Helper function to filter for text completion models only
function isTextCompletionModel(modelId) {
  // Filter out embedding, whisper, dall-e, tts, and other non-text-completion models
  const excludePatterns = [
    'embedding', 'whisper', 'dall-e', 'tts', 'davinci-edit', 'curie-edit',
    'babbage-edit', 'ada-edit', 'text-moderation', 'gpt-3.5-turbo-instruct'
  ];

  return !excludePatterns.some(pattern => modelId.toLowerCase().includes(pattern)) &&
         modelId.includes('gpt');
}

// Helper function to get latest version of each model family
function getLatestModelVersions(models) {
  const modelFamilies = {};

  models.forEach(model => {
    // Extract base model name (e.g., 'gpt-4o' from 'gpt-4o-2024-05-13')
    let baseName = model.value;

    // Remove date patterns (YYYY-MM-DD)
    baseName = baseName.replace(/-\d{4}-\d{2}-\d{2}$/, '');

    // Remove version patterns like -0125, -1106, -preview
    baseName = baseName.replace(/-\d{4}$/, '');
    baseName = baseName.replace(/-preview$/, '');
    baseName = baseName.replace(/-turbo-\d{4}$/, '-turbo');

    if (!modelFamilies[baseName]) {
      modelFamilies[baseName] = model;
    } else {
      // Prefer base model names over versioned ones
      // If current model is the base name (no suffixes), prefer it
      // Otherwise, use lexicographic comparison for versioned models
      const currentModel = modelFamilies[baseName];
      const isCurrentBase = currentModel.value === baseName;
      const isNewBase = model.value === baseName;

      if (isNewBase && !isCurrentBase) {
        // New model is base, current is versioned - prefer base
        modelFamilies[baseName] = model;
      } else if (!isNewBase && !isCurrentBase) {
        // Both are versioned - use lexicographic comparison (latest date/version)
        if (model.value > currentModel.value) {
          modelFamilies[baseName] = model;
        }
      }
      // If current is base and new is versioned, keep current (base)
    }
  });

  return Object.values(modelFamilies);
}

// Fetch available models from OpenAI
async function fetchOpenAIModels() {
  try {
    const client = await initOpenAI();
    const response = await client.models.list();

    // Filter for text completion models only
    const textCompletionModels = response.data
      .filter(model => isTextCompletionModel(model.id))
      .map(model => ({
        value: model.id,
        label: model.id.toUpperCase().replace(/-/g, ' '),
        recommended: false
      }))
      .sort((a, b) => a.value.localeCompare(b.value));

    // Get only latest versions of each model family
    const latestModels = getLatestModelVersions(textCompletionModels);

    // Mark recommended model
    const recommendedModel = latestModels.find(m => m.value === 'gpt-4o');
    if (recommendedModel) {
      recommendedModel.recommended = true;
      // Move recommended model to the front
      const otherModels = latestModels.filter(m => m.value !== 'gpt-4o');
      return [recommendedModel, ...otherModels];
    }

    return latestModels;
  } catch (error) {
    debugLog(`Failed to fetch OpenAI models: ${error.message}`, 'yellow');
    // Fallback to hardcoded models
    return OPENAI_MODELS;
  }
}

// Helper function to filter for Gemini text completion models only
function isGeminiTextCompletionModel(modelName) {
  // Filter for models that support text generation
  // Exclude embedding or other specialized models
  const excludePatterns = ['embedding', 'vision', 'audio'];

  return modelName.includes('gemini') &&
         !excludePatterns.some(pattern => modelName.toLowerCase().includes(pattern));
}

// Helper function to get latest Gemini model versions
function getLatestGeminiVersions(models) {
  const modelFamilies = {};

  models.forEach(model => {
    // Extract base model name (e.g., 'gemini-2.0-flash' from 'gemini-2.0-flash-001')
    let baseName = model.value;

    // Remove version suffixes like -001, -002, etc.
    baseName = baseName.replace(/-\d{3}$/, '');

    // For Gemini models, we want to keep the most recent version
    // Use lexicographic comparison which works well for Gemini versioning
    if (!modelFamilies[baseName] || model.value > modelFamilies[baseName].value) {
      modelFamilies[baseName] = model;
    }
  });

  return Object.values(modelFamilies);
}

// Fetch available models from Google Gemini
async function fetchGeminiModels() {
  try {
    const client = await initGemini();

    // Use the REST API to list models since the SDK doesn't have a direct listModels method
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (!data.models) {
      throw new Error('No models returned from Gemini API');
    }

    // Filter for text completion models only
    const textCompletionModels = data.models
      .filter(model => isGeminiTextCompletionModel(model.name))
      .map(model => {
        const modelId = model.name.split('/').pop();
        return {
          value: modelId,
          label: modelId.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' '),
          recommended: false
        };
      })
      .sort((a, b) => a.value.localeCompare(b.value));

    // Get only latest versions of each model family
    const latestModels = getLatestGeminiVersions(textCompletionModels);

    // Mark recommended model
    const recommendedModel = latestModels.find(m => m.value === 'gemini-2.5-flash');
    if (recommendedModel) {
      recommendedModel.recommended = true;
      // Move recommended model to the front
      const otherModels = latestModels.filter(m => m.value !== 'gemini-2.5-flash');
      const reorderedModels = [recommendedModel, ...otherModels];

      // Add custom model option
      reorderedModels.push({ value: 'custom', label: 'Custom Model (Enter manually)' });

      return reorderedModels;
    }

    // Add custom model option
    latestModels.push({ value: 'custom', label: 'Custom Model (Enter manually)' });

    return latestModels;
  } catch (error) {
    debugLog(`Failed to fetch Gemini models: ${error.message}`, 'yellow');
    // Fallback to hardcoded models
    return GEMINI_MODELS;
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
      { value: AI_PROVIDERS.GEMINI, label: 'Google Gemini' }
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
  }

  // Select model based on provider
  let model;
  if (provider === AI_PROVIDERS.OPENAI) {
    const s = spinner();
    s.start('Fetching available OpenAI models...');
    const availableModels = await fetchOpenAIModels();
    s.stop('Models fetched successfully');

    model = await select({
      message: 'Choose your OpenAI model:',
      options: availableModels.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.recommended ? 'Recommended' : undefined
      }))
    });
  } else if (provider === AI_PROVIDERS.GEMINI) {
    const s = spinner();
    s.start('Fetching available Gemini models...');
    const availableModels = await fetchGeminiModels();
    s.stop('Models fetched successfully');

    model = await select({
      message: 'Choose your Google Gemini model:',
      options: availableModels.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.recommended ? 'Recommended' : undefined
      }))
    });

    // Handle custom model input
    if (model === 'custom') {
      const customModel = await text({
        message: 'Enter your custom Gemini model name:',
        validate: (value) => {
          if (!value || value.trim() === '') return 'Model name is required';
        }
      });

      if (isCancel(customModel)) {
        cancel('Setup cancelled');
        process.exit(0);
      }

      model = customModel;
    }
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
      { value: 'update-gemini-key', label: 'Update Google Gemini API Key' }
    ]
  });

  if (isCancel(credentialAction)) {
    cancel('Credential update cancelled');
    return;
  }

  switch (credentialAction) {
    case 'update-openai-key':
      const openaiKey = await text({
        message: 'Enter your new OpenAI API key:',
        validate: (value) => {
          if (!value || value.trim() === '') return 'API key is required';
        }
      });

      if (!isCancel(openaiKey)) {
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
      }
      break;

    case 'update-gemini-key':
      const geminiKey = await text({
        message: 'Enter your new Google Gemini API key:',
        validate: (value) => {
          if (!value || value.trim() === '') return 'API key is required';
        }
      });

      if (!isCancel(geminiKey)) {
        // Update .env file
        let envContent = fs.existsSync(ENV_FILE_PATH) ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
        if (envContent.includes('GEMINI_API_KEY=')) {
          envContent = envContent.replace(/GEMINI_API_KEY=.*\n?/, `GEMINI_API_KEY=${geminiKey}\n`);
        } else {
          envContent += `GEMINI_API_KEY=${geminiKey}\n`;
        }
        fs.writeFileSync(ENV_FILE_PATH, envContent);
        process.env.GEMINI_API_KEY = geminiKey;
        log.success(colorize.green('Google Gemini API key updated successfully!'));
      }
      break;
  }

  outro(colorize.green('Credentials updated!'));
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

// Settings management
async function showSettings() {
  intro(colorize.cyan('⚙️  BlueJay Settings'));

  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'change-provider', label: `AI Provider: ${preferences.aiProvider || 'Not set'}` },
      { value: 'change-model', label: `Model: ${preferences.defaultModel || 'Not set'}` },
      { value: 'update-credentials', label: 'Update Credentials' },
      { value: 'preferences', label: 'Preferences' },
      { value: 'view-current', label: 'View Current Settings' }
    ]
  });

  if (isCancel(action)) {
    cancel('Settings cancelled');
    return;
  }

  let updatedPreferences = { ...preferences };

  switch (action) {
    case 'change-provider':
      const newProvider = await select({
        message: 'Choose your AI provider:',
        options: [
          { value: AI_PROVIDERS.OPENAI, label: 'OpenAI (GPT models)' },
          { value: AI_PROVIDERS.GEMINI, label: 'Google Gemini' }
        ]
      });

      if (!isCancel(newProvider)) {
        updatedPreferences.aiProvider = newProvider;
        // Reset model when changing provider
        updatedPreferences.defaultModel = null;

        // Check API key for the selected provider
        if (newProvider === AI_PROVIDERS.OPENAI) {
          await checkOpenAIKey();
        } else if (newProvider === AI_PROVIDERS.GEMINI) {
          await checkGeminiKey();
        }

        // Immediately prompt for model selection after provider change
        const s = spinner();
        s.start(`Fetching available ${newProvider === AI_PROVIDERS.OPENAI ? 'OpenAI' : 'Gemini'} models...`);
        const models = newProvider === AI_PROVIDERS.OPENAI ? await fetchOpenAIModels() : await fetchGeminiModels();
        s.stop('Models fetched successfully');

        const newModel = await select({
          message: `Choose your ${newProvider === AI_PROVIDERS.OPENAI ? 'OpenAI' : 'Google Gemini'} model:`,
          options: models.map(m => ({
            value: m.value,
            label: m.label,
            hint: m.recommended ? 'Recommended' : undefined
          }))
        });

        if (!isCancel(newModel)) {
          // Handle custom model for Gemini
          if (newModel === 'custom' && newProvider === AI_PROVIDERS.GEMINI) {
            const customModel = await text({
              message: 'Enter your custom Gemini model name:',
              validate: (value) => {
                if (!value || value.trim() === '') return 'Model name is required';
              }
            });

            if (!isCancel(customModel)) {
              updatedPreferences.defaultModel = customModel;
            }
          } else {
            updatedPreferences.defaultModel = newModel;
          }
        }
      }
      break;

    case 'change-model':
      const s2 = spinner();
      s2.start(`Fetching available ${preferences.aiProvider === AI_PROVIDERS.OPENAI ? 'OpenAI' : 'Gemini'} models...`);
      const models = preferences.aiProvider === AI_PROVIDERS.OPENAI ? await fetchOpenAIModels() : await fetchGeminiModels();
      s2.stop('Models fetched successfully');

      const newModel = await select({
        message: `Choose your ${preferences.aiProvider === AI_PROVIDERS.OPENAI ? 'OpenAI' : 'Google Gemini'} model:`,
        options: models.map(m => ({
          value: m.value,
          label: m.label,
          hint: m.recommended ? 'Recommended' : undefined
        }))
      });

      if (!isCancel(newModel)) {
        // Handle custom model for Gemini
        if (newModel === 'custom' && preferences.aiProvider === AI_PROVIDERS.GEMINI) {
          const customModel = await text({
            message: 'Enter your custom Gemini model name:',
            validate: (value) => {
              if (!value || value.trim() === '') return 'Model name is required';
            }
          });

          if (!isCancel(customModel)) {
            updatedPreferences.defaultModel = customModel;
          }
        } else {
          updatedPreferences.defaultModel = newModel;
        }
      }
      break;

    case 'update-credentials':
      await updateCredentials();
      break;

    case 'preferences':
      updatedPreferences = await managePreferences();
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
  }

  outro(colorize.green('Settings updated!'));
}

// Ask AI if the input is a terminal command (works with both OpenAI and Gemini)
async function isTerminalCommand(aiClient, userInput, provider) {
  try {
    const systemPrompt = 'You are a helpful assistant that runs in a terminal on a MAC OS/LINUX. Your primary goal is to interpret user input as terminal commands whenever possible. Be very liberal in your interpretation - if there is any way the user\'s request could be fulfilled with a terminal command, provide that command. Even if the request is ambiguous or could be interpreted in multiple ways, prefer to respond with a command rather than "NOT_A_COMMAND". If you provide a command, respond ONLY with the command to run, with no additional text or explanation. Only respond with "NOT_A_COMMAND" if the user\'s input is clearly not related to any possible terminal operation or file system task.';

    let content;

    if (provider === AI_PROVIDERS.OPENAI) {
      const response = await aiClient.chat.completions.create({
        model: preferences.defaultModel,
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
      content = response.choices[0].message.content;
    } else if (provider === AI_PROVIDERS.GEMINI) {
      // Ensure we have a valid model name
      const modelName = preferences.defaultModel || 'gemini-2.5-flash';
      const model = aiClient.getGenerativeModel({ model: modelName });
      const prompt = `${systemPrompt}\n\nUser: ${userInput}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      content = response.text();
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
        reject({ code, message: `Command exited with code ${code}` });
      }
    });

    childProcess.on('error', (error) => {
      reject({ code: 1, message: `Error: ${error.message}` });
    });
  });
}

// Main function
async function main() {
  try {
    // Get user input from command line arguments
    let userInput = process.argv.slice(2).join(' ');

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

    if (!userInput) {
      log.info(colorize.yellow('Usage: j "your request here"'));
      log.info(colorize.blue('Use "j settings" to configure your AI provider and preferences'));
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
    const toolType = await determineToolType(aiClient, userInput, currentPreferences.aiProvider);

    // Stop the spinner
    spinner.stop();

    debugLog(`Determined tool type: ${toolType}`, 'blue');

    // Run the appropriate tool
    if (toolType === TOOLS.TERMINAL) {
      // For terminal commands, we still need to get the exact command
      const { isCommand, command } = await isTerminalCommand(aiClient, userInput, currentPreferences.aiProvider);

      if (isCommand && command) {
        log.step(colorize.green('I think you want to run this command:'));
        log.info(colorize.cyan(command));

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
            const output = await executeCommand(command);

            // Add command to shell history after successful execution
            addToShellHistory(command);

            // For interactive commands, the output is just a success message
            // For non-interactive commands, show the actual output
            if (command && isInteractiveCommand(command)) {
              // Use debug log wrapper function for interactive command completion
              debugLog(`Interactive command "${command}" completed.`, 'green')
            } else {
              log.success(colorize.green('Command executed successfully:'));
              log.info(output);
            }
          } catch (error) {
            log.error(colorize.red('Failed to execute command:'), error.message);
          }
        } else {
          log.warn(colorize.yellow('Command execution cancelled.'));
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

// Run the main function
main();
