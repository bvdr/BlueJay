#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { confirm, select, log, intro, outro } = require('@clack/prompts');
const chalk = require('chalk');

const J_DIR_PATH = path.join(os.homedir(), '.j');
const ENV_FILE_PATH = path.join(J_DIR_PATH, '.env');
const HOME_PREFERENCES_FILE_PATH = path.join(J_DIR_PATH, '.j-preferences');
const LOCAL_PREFERENCES_FILE_PATH = path.join(process.cwd(), '.j-preferences');

async function cleanFiles(files) {
  let deletedCount = 0;
  let notFoundCount = 0;

  for (const file of files) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        log.success(chalk.green(`✅ Deleted: ${file}`));
        deletedCount++;
      } catch (error) {
        log.error(chalk.red(`❌ Failed to delete ${file}: ${error.message}`));
      }
    } else {
      log.info(chalk.blue(`ℹ️  Not found: ${file}`));
      notFoundCount++;
    }
  }

  return { deletedCount, notFoundCount };
}

async function main() {
  intro(chalk.cyan('🧹 BlueJay Cleanup Utility'));

  // Check which files exist
  const envExists = fs.existsSync(ENV_FILE_PATH);
  const homePrefsExists = fs.existsSync(HOME_PREFERENCES_FILE_PATH);
  const localPrefsExists = fs.existsSync(LOCAL_PREFERENCES_FILE_PATH);

  if (!envExists && !homePrefsExists && !localPrefsExists) {
    log.info(chalk.yellow('No BlueJay configuration files found.'));
    outro(chalk.blue('Nothing to clean!'));
    return;
  }

  // Show what will be cleaned
  log.info(chalk.blue('\n📋 Configuration files found:'));
  if (envExists) log.info(chalk.cyan(`  • API Keys: ${ENV_FILE_PATH}`));
  if (homePrefsExists) log.info(chalk.cyan(`  • Global Preferences: ${HOME_PREFERENCES_FILE_PATH}`));
  if (localPrefsExists) log.info(chalk.cyan(`  • Local Preferences: ${LOCAL_PREFERENCES_FILE_PATH}`));

  // Ask what to clean
  const cleanOption = await select({
    message: 'What would you like to clean?',
    options: [
      { value: 'all', label: 'Everything (API keys + preferences)' },
      { value: 'prefs', label: 'Only preferences (keep API keys)' },
      { value: 'env', label: 'Only API keys (keep preferences)' },
      { value: 'cancel', label: 'Cancel' }
    ]
  });

  if (cleanOption === 'cancel') {
    outro(chalk.blue('Cleanup cancelled'));
    return;
  }

  // Confirm deletion
  const shouldDelete = await confirm({
    message: 'Are you sure? This action cannot be undone.',
    initialValue: false
  });

  if (!shouldDelete) {
    outro(chalk.blue('Cleanup cancelled'));
    return;
  }

  // Determine which files to delete
  let filesToDelete = [];
  switch (cleanOption) {
    case 'all':
      filesToDelete = [ENV_FILE_PATH, HOME_PREFERENCES_FILE_PATH, LOCAL_PREFERENCES_FILE_PATH];
      break;
    case 'prefs':
      filesToDelete = [HOME_PREFERENCES_FILE_PATH, LOCAL_PREFERENCES_FILE_PATH];
      break;
    case 'env':
      filesToDelete = [ENV_FILE_PATH];
      break;
  }

  // Clean files
  log.info(chalk.blue('\n🗑️  Cleaning files...'));
  const { deletedCount, notFoundCount } = await cleanFiles(filesToDelete);

  // Summary
  if (deletedCount > 0) {
    outro(chalk.green(`✅ Cleanup complete! ${deletedCount} file(s) deleted.`));
  } else {
    outro(chalk.blue('No files were deleted.'));
  }
}

main().catch((error) => {
  log.error(chalk.red('Error during cleanup:'), error.message);
  process.exit(1);
});
