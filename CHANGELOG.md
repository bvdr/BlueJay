## [2.0.1] - 2025-07-02

### Added
- Version 2.0.1 release

## [2.0.0] - 2025-07-02

### Added
- Version 2.0.0 release

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2024-07-02

### Added
- Initial release of BlueJay (j) CLI tool
- Natural language processing of user requests using OpenAI API
- Automatic detection and execution of terminal commands
- Secure storage of API keys and preferences in `~/.j/.env`
- Debug mode for troubleshooting
- Support for both interactive and non-interactive commands
- Customizable preferences and settings via `.j-preferences` file
- Command confirmation before execution (configurable)
- Colored terminal output support
- Command history saving and management
- Global installation support via npm
- Configuration options:
  - `defaultModel`: OpenAI model selection (default: "gpt-4o")
  - `showCommandConfirmation`: Command confirmation toggle
  - `colorOutput`: Colored output toggle
  - `saveCommandHistory`: History saving toggle
  - `maxHistoryItems`: Maximum history items limit
  - `debug`: Debug mode toggle

### Dependencies
- dotenv ^16.4.5 - Environment variable management
- openai ^4.67.3 - OpenAI API integration
- inquirer ^8.2.6 - Interactive command line prompts
- chalk ^4.1.2 - Terminal string styling
- ora ^5.4.1 - Loading spinners
- @octokit/rest ^19.0.13 - GitHub API integration

### Security
- API keys stored locally and never transmitted except to OpenAI
- Secure handling of sensitive configuration data

[Unreleased]: https://github.com/bvdr/BlueJay/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bvdr/BlueJay/releases/tag/v1.0.0
