const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Paths
const J_DIR_PATH = path.join(os.homedir(), '.j');
const GLOBAL_CONTEXT_FILE = path.join(J_DIR_PATH, '.context');

/**
 * Context Manager for storing and retrieving conversation history
 * Supports both local (per-folder) and global contexts
 */
class ContextManager {
  /**
   * @param {object} preferences - User preferences object
   */
  constructor(preferences = {}) {
    this.scope = preferences.contextScope || 'local';
    this.maxEntries = preferences.maxContextEntries || 5;
    this.ttlMinutes = preferences.contextTTL || 30;
    this.maxOutputLength = preferences.maxOutputLength || 2000;
    this.captureOutput = preferences.captureCommandOutput !== false;
  }

  /**
   * Get the path to the context file based on scope
   * @returns {string} Path to context file
   */
  getContextPath() {
    if (this.scope === 'local') {
      return path.join(process.cwd(), '.j-context');
    }
    return GLOBAL_CONTEXT_FILE;
  }

  /**
   * Generate a unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Check if context is stale based on TTL
   * @param {object} context - Context object
   * @returns {boolean} True if context is stale
   */
  isStale(context) {
    if (!context || !context.lastUpdated) return true;

    const lastUpdated = new Date(context.lastUpdated);
    const now = new Date();
    const diffMinutes = (now - lastUpdated) / 1000 / 60;

    return diffMinutes > this.ttlMinutes;
  }

  /**
   * Load context from file
   * @returns {object|null} Context object or null
   */
  loadContext() {
    try {
      const contextPath = this.getContextPath();

      if (!fs.existsSync(contextPath)) {
        return null;
      }

      const data = fs.readFileSync(contextPath, 'utf8');
      const context = JSON.parse(data);

      // Check if stale
      if (this.isStale(context)) {
        this.clearContext();
        return null;
      }

      return context;
    } catch (error) {
      // Silently fail - corrupt or invalid context
      return null;
    }
  }

  /**
   * Save context to file
   * @param {object} context - Context object to save
   */
  saveContext(context) {
    try {
      const contextPath = this.getContextPath();
      const dir = path.dirname(contextPath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
    } catch (error) {
      // Silently fail - don't break the command if context can't be saved
      console.error('Warning: Could not save context:', error.message);
    }
  }

  /**
   * Add a new interaction to context
   * @param {string} userInput - User's input
   * @param {string} command - Generated command
   */
  addInteraction(userInput, command) {
    let context = this.loadContext();

    if (!context) {
      context = {
        sessionId: this.generateSessionId(),
        createdAt: new Date().toISOString(),
        context: []
      };
    }

    context.context.push({
      timestamp: new Date().toISOString(),
      userInput,
      command,
      executed: false,
      output: null,
      error: null,
      exitCode: null
    });

    context.lastUpdated = new Date().toISOString();

    // Enforce max entries - keep only the most recent
    if (context.context.length > this.maxEntries) {
      context.context = context.context.slice(-this.maxEntries);
    }

    this.saveContext(context);
  }

  /**
   * Update the last interaction with execution results
   * @param {object} updates - Updates to apply (executed, output, error, exitCode)
   */
  updateLastInteraction(updates) {
    const context = this.loadContext();
    if (!context || context.context.length === 0) return;

    const lastInteraction = context.context[context.context.length - 1];

    // Apply updates
    Object.assign(lastInteraction, updates);

    // Truncate output if too long
    if (lastInteraction.output && this.maxOutputLength) {
      if (lastInteraction.output.length > this.maxOutputLength) {
        lastInteraction.output =
          lastInteraction.output.substring(0, this.maxOutputLength) +
          '\n... (output truncated)';
      }
    }

    context.lastUpdated = new Date().toISOString();
    this.saveContext(context);
  }

  /**
   * Convert context to messages array for AI
   * @returns {Array} Array of message objects
   */
  getMessagesForAI() {
    const context = this.loadContext();
    if (!context || context.context.length === 0) return [];

    const messages = [];

    context.context.forEach(interaction => {
      // Add user message
      messages.push({
        role: 'user',
        content: interaction.userInput
      });

      // Build assistant response
      let assistantContent = interaction.command;

      // Append execution results if available and capture is enabled
      if (interaction.executed && this.captureOutput) {
        if (interaction.output) {
          assistantContent += `\n\n[Command output:\n${interaction.output}]`;
        }
        if (interaction.error) {
          assistantContent += `\n\n[Error output:\n${interaction.error}]`;
        }
        if (interaction.exitCode !== null && interaction.exitCode !== 0) {
          assistantContent += `\n\n[Exit code: ${interaction.exitCode}]`;
        }
      }

      messages.push({
        role: 'assistant',
        content: assistantContent
      });
    });

    return messages;
  }

  /**
   * Get formatted context for display
   * @returns {string} Formatted context string
   */
  getFormattedContext() {
    const context = this.loadContext();

    if (!context || context.context.length === 0) {
      return 'No context available.';
    }

    let output = `Session ID: ${context.sessionId}\n`;
    output += `Created: ${new Date(context.createdAt).toLocaleString()}\n`;
    output += `Last Updated: ${new Date(context.lastUpdated).toLocaleString()}\n`;
    output += `Scope: ${this.scope}\n`;
    output += `\nInteractions (${context.context.length}/${this.maxEntries}):\n\n`;

    context.context.forEach((interaction, index) => {
      output += `[${index + 1}] ${new Date(interaction.timestamp).toLocaleTimeString()}\n`;
      output += `  User: ${interaction.userInput}\n`;
      output += `  Command: ${interaction.command}\n`;
      output += `  Executed: ${interaction.executed ? 'Yes' : 'No'}\n`;

      if (interaction.executed) {
        if (interaction.exitCode !== null) {
          output += `  Exit Code: ${interaction.exitCode}\n`;
        }
        if (interaction.output) {
          const outputPreview = interaction.output.substring(0, 100);
          output += `  Output: ${outputPreview}${interaction.output.length > 100 ? '...' : ''}\n`;
        }
        if (interaction.error) {
          output += `  Error: ${interaction.error.substring(0, 100)}\n`;
        }
      }
      output += '\n';
    });

    return output;
  }

  /**
   * Clear context file
   */
  clearContext() {
    try {
      const contextPath = this.getContextPath();
      if (fs.existsSync(contextPath)) {
        fs.unlinkSync(contextPath);
      }
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Check if context exists
   * @returns {boolean} True if context exists
   */
  hasContext() {
    const context = this.loadContext();
    return context && context.context && context.context.length > 0;
  }
}

module.exports = ContextManager;
