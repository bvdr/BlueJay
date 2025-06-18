# Jarvis CLI (j)

A command line tool that speeds up your development process by using AI to understand and execute your requests.

## Features

- Natural language processing of your requests
- Automatic detection and execution of terminal commands
- Secure storage of API keys and preferences

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/jarvis-cli.git
cd jarvis-cli

# Install dependencies
npm install

# Install globally
npm install -g .
```

After installation, you can use the `j` command from anywhere in your terminal.

## Usage

```bash
# Ask Jarvis to list files in the current directory
j "list all the files in this folder"

# Ask Jarvis to create a new directory
j "create a new directory called my-project"

# Ask Jarvis for help with a git command
j "how do I revert my last commit"
```

## Configuration

On first run, Jarvis will ask for your OpenAI API key, which will be stored securely in the `~/.j/.env` file in your home directory.

You can customize Jarvis by editing the `.j-preferences` file in your home directory.

## Available Settings

The `.j-preferences` file contains the following settings:

```json
{
  "defaultModel": "gpt-4o",
  "showCommandConfirmation": true,
  "colorOutput": true,
  "saveCommandHistory": true,
  "maxHistoryItems": 100
}
```

## License

MIT
