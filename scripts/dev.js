#!/usr/bin/env node

const { exec } = require('child_process');
const chalk = require('chalk');
const { log } = require('@clack/prompts');

console.log(chalk.blue('🔗 Setting up development environment...\n'));

// Check if already linked
exec('npm ls -g --depth=0 --link=true', (error, stdout, stderr) => {
  const isLinked = stdout.includes('@bvdr/bluejay');

  if (isLinked) {
    console.log(chalk.yellow('⚠️  BlueJay is already linked for development.'));
    console.log(chalk.blue('💡 The global "j" command will use your local code.'));
    console.log(chalk.cyan('\nTo unlink, run: npm run dev:unlink\n'));
    return;
  }

  // Run npm link
  console.log(chalk.cyan('Creating symlink to local development version...'));
  exec('npm link', (error, stdout, stderr) => {
    if (error) {
      console.log(chalk.red('❌ Failed to create development symlink:'));
      console.log(chalk.red(error.message));
      process.exit(1);
    }

    if (stderr) {
      console.log(chalk.yellow(stderr));
    }

    console.log(chalk.green('✅ Development environment ready!\n'));
    console.log(chalk.blue('📝 Your local changes will now be reflected when you run the "j" command.'));
    console.log(chalk.blue('💡 No need to reinstall after code changes - just edit and test!'));
    console.log(chalk.cyan('\nTo unlink and restore the production version, run: npm run dev:unlink\n'));
  });
});
