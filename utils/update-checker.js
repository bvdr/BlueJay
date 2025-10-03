const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// Path for storing update check cache
const J_DIR_PATH = path.join(os.homedir(), '.j');
const UPDATE_CHECK_FILE = path.join(J_DIR_PATH, '.update-check');

// Check interval: 24 hours
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * Fetch the latest version from npm registry
 * @param {string} packageName - The npm package name
 * @returns {Promise<string|null>} The latest version or null if error
 */
function fetchLatestVersion(packageName) {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${packageName}/latest`;

    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch (error) {
          resolve(null);
        }
      });
    }).on('error', () => {
      // Silently fail - we don't want update checks to interfere with functionality
      resolve(null);
    }).on('timeout', () => {
      resolve(null);
    });
  });
}

/**
 * Compare two semantic versions
 * @param {string} current - Current version
 * @param {string} latest - Latest version
 * @returns {boolean} True if latest is newer than current
 */
function isNewerVersion(current, latest) {
  const parseCurrent = current.split('.').map(n => parseInt(n, 10));
  const parseLatest = latest.split('.').map(n => parseInt(n, 10));

  for (let i = 0; i < 3; i++) {
    if (parseLatest[i] > parseCurrent[i]) return true;
    if (parseLatest[i] < parseCurrent[i]) return false;
  }

  return false;
}

/**
 * Read cached update check data
 * @returns {object|null} Cached data or null
 */
function readCache() {
  try {
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      const data = fs.readFileSync(UPDATE_CHECK_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    // Ignore cache read errors
  }
  return null;
}

/**
 * Write update check data to cache
 * @param {object} data - Data to cache
 */
function writeCache(data) {
  try {
    // Ensure .j directory exists
    if (!fs.existsSync(J_DIR_PATH)) {
      fs.mkdirSync(J_DIR_PATH, { recursive: true });
    }
    fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    // Ignore cache write errors
  }
}

/**
 * Check if an update is available
 * @param {string} currentVersion - The current version
 * @returns {Promise<object>} Object with updateAvailable flag and latestVersion
 */
async function checkForUpdates(currentVersion) {
  const packageName = '@bvdr/bluejay';

  // Check cache first
  const cache = readCache();
  const now = Date.now();

  if (cache && cache.lastCheck && (now - cache.lastCheck) < CHECK_INTERVAL) {
    // Use cached result if within check interval
    return {
      updateAvailable: cache.updateAvailable || false,
      latestVersion: cache.latestVersion || null,
      fromCache: true
    };
  }

  // Fetch latest version from npm
  const latestVersion = await fetchLatestVersion(packageName);

  if (!latestVersion) {
    // If fetch failed, use cache if available
    if (cache && cache.latestVersion) {
      return {
        updateAvailable: cache.updateAvailable || false,
        latestVersion: cache.latestVersion,
        fromCache: true
      };
    }

    return {
      updateAvailable: false,
      latestVersion: null,
      fromCache: false
    };
  }

  // Check if update is available
  const updateAvailable = isNewerVersion(currentVersion, latestVersion);

  // Cache the result
  writeCache({
    lastCheck: now,
    latestVersion,
    updateAvailable
  });

  return {
    updateAvailable,
    latestVersion,
    fromCache: false
  };
}

module.exports = {
  checkForUpdates
};
