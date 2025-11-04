const fs = require('fs');
const path = require('path');
const os = require('os');

// Paths
const J_DIR_PATH = path.join(os.homedir(), '.j');
const LOGS_DIR = path.join(J_DIR_PATH, 'logs');

/**
 * Logger for persistent command history
 * Stores all interactions in daily log files
 */
class Logger {
  /**
   * @param {object} preferences - User preferences object
   */
  constructor(preferences = {}) {
    this.enabled = preferences.enableLogging !== false;
    this.logDir = preferences.logPath || LOGS_DIR;
    this.retentionDays = preferences.logRetentionDays || 30;

    if (this.enabled) {
      this.ensureLogDir();
      this.cleanOldLogs();
    }
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Warning: Could not create log directory:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Get the log file path for today
   * @returns {string} Path to today's log file
   */
  getLogPath() {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${date}.log`);
  }

  /**
   * Log an interaction
   * @param {object} entry - Log entry object
   */
  log(entry) {
    if (!this.enabled) return;

    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        cwd: process.cwd(),
        ...entry
      };

      const logPath = this.getLogPath();
      const logLine = JSON.stringify(logEntry) + '\n';

      fs.appendFileSync(logPath, logLine);
    } catch (error) {
      // Silently fail - don't break command execution
      console.error('Warning: Could not write to log file:', error.message);
    }
  }

  /**
   * Clean up old log files based on retention policy
   */
  cleanOldLogs() {
    if (!this.enabled || this.retentionDays === 0) return;

    try {
      if (!fs.existsSync(this.logDir)) return;

      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      files.forEach(file => {
        if (!file.endsWith('.log')) return;

        const filePath = path.join(this.logDir, file);
        try {
          const stats = fs.statSync(filePath);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          // Skip files we can't access
        }
      });
    } catch (error) {
      // Silently fail - cleanup is not critical
    }
  }

  /**
   * Read log entries from a specific date
   * @param {string} date - Date in YYYY-MM-DD format (default: today)
   * @returns {Array} Array of log entries
   */
  readLogs(date = null) {
    if (!this.enabled) return [];

    try {
      const logDate = date || new Date().toISOString().split('T')[0];
      const logPath = path.join(this.logDir, `${logDate}.log`);

      if (!fs.existsSync(logPath)) return [];

      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');

      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return null;
        }
      }).filter(entry => entry !== null);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get formatted logs for display
   * @param {string} date - Date in YYYY-MM-DD format (default: today)
   * @returns {string} Formatted log string
   */
  getFormattedLogs(date = null) {
    const logs = this.readLogs(date);

    if (logs.length === 0) {
      return 'No logs available for this date.';
    }

    let output = `Logs for ${date || 'today'} (${logs.length} entries):\n\n`;

    logs.forEach((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      output += `[${index + 1}] ${time}\n`;
      output += `  Directory: ${log.cwd}\n`;
      output += `  User Input: ${log.userInput}\n`;
      output += `  Command: ${log.command}\n`;
      output += `  Executed: ${log.executed ? 'Yes' : 'No'}\n`;

      if (log.result) {
        if (log.result.exitCode !== undefined) {
          output += `  Exit Code: ${log.result.exitCode}\n`;
        }
        if (log.result.output) {
          const outputPreview = log.result.output.substring(0, 100);
          output += `  Output: ${outputPreview}${log.result.output.length > 100 ? '...' : ''}\n`;
        }
        if (log.result.error) {
          output += `  Error: ${log.result.error.substring(0, 100)}\n`;
        }
      } else if (log.error) {
        output += `  Error: ${log.error}\n`;
      }

      output += '\n';
    });

    return output;
  }
}

module.exports = Logger;
