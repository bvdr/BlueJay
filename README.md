
<img src="https://github.com/user-attachments/assets/a964f6f2-b2b0-48b3-bdce-a328c5e13690" width=300 />

# BlueJay (j)

A command-line tool that speeds up your development process by using AI to understand and execute your requests.

## Features

- Natural language processing of your requests
- Automatic detection and execution of terminal commands
- Secure storage of API keys and preferences
- Debug mode for troubleshooting
- Support for both interactive and non-interactive commands
- Customizable preferences and settings

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)
- OpenAI API key

## Installation

### From GitHub Packages (Recommended)

```bash
# Install globally from GitHub Packages
npm install -g @bvdr/bluejay
```

### From Source

```bash
# Clone the repository
git clone https://github.com/bvdr/BlueJay.git
cd BlueJay

# Install dependencies
npm install

# Install globally
npm install -g .
```

After installation, you can use the `j` command from anywhere in your terminal.

## Usage

```bash
# Ask BlueJay to list files in the current directory
j "list all the files in this folder"

# Ask BlueJay to create a new directory
j "create a new directory called my-project"

# Ask BlueJay for help with a git command
j "how do I revert my last commit"

# Ask BlueJay to help with file operations
j "find all JavaScript files in this directory"

# Ask BlueJay to help with system tasks
j "show me the current disk usage"
```

## Configuration

On first run, BlueJay will ask for your OpenAI API key, which will be stored securely in the `~/.j/.env` file in your home directory.

You can customize BlueJay by editing the `.j-preferences` file in the `~/.j/` directory or in your current project directory (local preferences take precedence).

## Available Settings

The `.j-preferences` file contains the following settings:

```json
{
  "defaultModel": "gpt-4o",
  "showCommandConfirmation": true,
  "colorOutput": true,
  "saveCommandHistory": true,
  "maxHistoryItems": 100,
  "debug": false
}
```

### Setting Descriptions

- **defaultModel**: The OpenAI model to use for processing requests (default: "gpt-4o")
- **showCommandConfirmation**: Whether to ask for confirmation before executing commands (default: true)
- **colorOutput**: Whether to use colored output in the terminal (default: true)
- **saveCommandHistory**: Whether to save command history (default: true)
- **maxHistoryItems**: Maximum number of history items to keep (default: 100)
- **debug**: Whether to show debug information during execution (default: false)

## How It Works

BlueJay CLI uses AI to interpret your natural language requests and convert them into terminal commands. Here's the process:

1. **Input Processing**: You provide a natural language request
2. **AI Analysis**: The AI analyzes your request to determine if it can be fulfilled with a terminal command
3. **Command Generation**: If applicable, the AI generates the appropriate terminal command
4. **Confirmation**: By default, BlueJay shows you the command and asks for confirmation before execution
5. **Execution**: Upon confirmation, the command is executed with proper handling for both interactive and non-interactive commands

### Interactive vs Non-Interactive Commands

BlueJay automatically detects whether a command is interactive (like `vim`, `nano`, `ssh`) and handles them appropriately:
- **Interactive commands**: Full terminal control is passed to the command
- **Non-interactive commands**: Output is captured and displayed after execution

## Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/BlueJay.git`
3. Install dependencies: `npm install`
4. Make your changes
5. Test your changes locally: `node test-package.js`
6. Submit a pull request

### Publishing (Maintainers Only)

This project uses GitHub Actions for automated publishing to GitHub Packages:

#### Automatic Publishing
- **On Push to Main**: The package is automatically published when code is pushed to the main branch
- **On Release**: The package is published when a new GitHub release is created

#### Manual Release Creation
1. Go to the "Actions" tab in the GitHub repository
2. Select "Create Release" workflow
3. Click "Run workflow"
4. Choose the version bump type (patch, minor, or major)
5. The workflow will:
   - Run tests
   - Bump the version in package.json
   - Update CHANGELOG.md
   - Create a git tag and GitHub release
   - Trigger the publish workflow automatically

#### Testing Package Configuration
Run the package test script to verify everything is configured correctly:
```bash
node test-package.js
```

## Issues

If you encounter any problems or have feature requests, please [open an issue](https://github.com/bvdr/BlueJay/issues) on GitHub.

## Security

This tool requires an OpenAI API key which is stored locally in `~/.j/.env`. Never commit this file or share your API key publicly.

## License

MIT - see the [LICENSE](LICENSE) file for details.
