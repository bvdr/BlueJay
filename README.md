# Jarvis CLI (j)

A command line tool that speeds up your development process by using AI to understand and execute your requests.

## Features

- Natural language processing of your requests
- Automatic detection and execution of terminal commands
- Interactive GitHub tool for browsing organizations, repositories, and pull requests
- Agentic execution for complex tasks requiring multiple steps
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

# Use the GitHub tool to browse repositories and pull requests
j "show me my GitHub repositories"
j "check pull requests for my organization"

# Use the Agentic Execution tool for complex tasks
j -agent "get latest PR's in the optinmonster app repo"
j -agent "setup a new React project with TypeScript and deploy it to Vercel"
```

## Configuration

On first run, Jarvis will ask for your OpenAI API key, which will be stored securely in the `~/.j/.env` file in your home directory.

When you first use the GitHub tool, Jarvis will ask for your GitHub personal access token, which will also be stored in the `~/.j/.env` file.

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

## Agentic Execution Tool

The Agentic Execution tool allows you to perform complex tasks that require multiple steps. It works by:

1. Creating a step-by-step plan (maximum 10 steps) to accomplish your request
2. Assessing the certainty level of each step (0-100%)
3. Executing each step sequentially
4. Asking for clarification when certainty is below the threshold (default 70%)
5. Verifying the results of each step

### Key Features

- **Orchestrator**: Plans tasks and assesses the certainty level of each step
- **Executor**: Performs tasks only if certainty is adequate; requests clarification otherwise
- **Selector/Verifier**: Validates task outcomes and confirms whether expectations align

### Usage

```bash
# Basic usage
j -agent "your complex task here"

# Examples
j -agent "get latest PR's in the x app repo"
j -agent "setup a new React project with TypeScript and deploy it to Vercel"
```

When using the Agentic Execution tool, you can configure the certainty threshold (0.0-1.0) that determines when the tool will ask for clarification.

## License

MIT
