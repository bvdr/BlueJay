#!/usr/bin/env node

const { exec } = require('child_process');
const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function checkForConflicts() {
  console.log(chalk.blue('🔍 Checking for existing "j" command conflicts...'));

  return new Promise((resolve) => {
    // Check if 'j' command already exists
    exec('which j', (error, stdout, stderr) => {
      if (error) {
        // No existing 'j' command found
        console.log(chalk.green('✅ No conflicts found. BlueJay "j" command is ready to use!'));
        resolve();
        return;
      }

      const existingPath = stdout.trim();
      const npmBinPath = path.join(process.env.npm_config_prefix || '/usr/local', 'bin', 'j');

      // If the existing command is already our npm-installed version, no conflict
      if (existingPath === npmBinPath) {
        console.log(chalk.green('✅ BlueJay "j" command is already properly installed!'));
        resolve();
        return;
      }

      // Conflict detected
      console.log(chalk.yellow('⚠️  Conflict detected!'));
      console.log(chalk.yellow(`An existing "j" command was found at: ${existingPath}`));
      console.log(chalk.yellow('This may interfere with BlueJay\'s "j" command.'));

      promptUserAction(existingPath, npmBinPath).then(resolve);
    });
  });
}

async function promptUserAction(existingPath, npmBinPath) {
  const choices = [
    {
      name: 'Continue anyway (you can use "npx @bvdr/bluejay" instead of "j")',
      value: 'continue'
    },
    {
      name: 'Show me how to resolve this manually',
      value: 'manual'
    },
    {
      name: 'Skip this check',
      value: 'skip'
    }
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'How would you like to proceed?',
      choices: choices
    }
  ]);

  switch (action) {
    case 'continue':
      console.log(chalk.blue('📝 Note: You can always use "npx @bvdr/bluejay" to run BlueJay commands.'));
      console.log(chalk.blue('📝 Or add the npm bin directory to your PATH to prioritize the npm-installed version.'));
      break;

    case 'manual':
      console.log(chalk.cyan('\n📋 Manual Resolution Options:'));
      console.log(chalk.cyan('1. Rename or remove the existing "j" command:'));
      console.log(chalk.white(`   sudo mv ${existingPath} ${existingPath}.backup`));
      console.log(chalk.cyan('2. Or use an alias in your shell profile (~/.bashrc, ~/.zshrc):'));
      console.log(chalk.white('   alias j="npx @bvdr/bluejay"'));
      console.log(chalk.cyan('3. Or ensure npm bin directory comes first in your PATH:'));
      console.log(chalk.white(`   export PATH="${path.dirname(npmBinPath)}:$PATH"`));
      break;

    case 'skip':
      console.log(chalk.blue('⏭️  Skipping conflict check.'));
      break;
  }

  console.log(chalk.green('\n🎉 BlueJay installation completed!'));
  console.log(chalk.blue('📖 Run "j --help" or "npx @bvdr/bluejay --help" to get started.'));
}

// Run the conflict check
checkForConflicts().catch((error) => {
  console.error(chalk.red('Error during post-install check:'), error.message);
  process.exit(0); // Don't fail the installation
});
