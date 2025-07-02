const { execSync } = require('child_process');
const fs = require('fs');

console.log('Testing npm publish configuration...');

// Read package.json to verify publishConfig
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('Package name:', packageJson.name);
console.log('PublishConfig:', packageJson.publishConfig);

// Test npm pack (simulates publish without actually publishing)
try {
  console.log('\nTesting npm pack...');
  const result = execSync('npm pack --dry-run', { encoding: 'utf8' });
  console.log('npm pack dry-run successful');

  // Check if the package would be published with correct access
  if (packageJson.publishConfig && packageJson.publishConfig.access === 'public') {
    console.log('✅ Package is configured for public access');
  } else {
    console.log('❌ Package is not configured for public access');
  }

} catch (error) {
  console.error('Error during npm pack test:', error.message);
}

console.log('\nConfiguration check complete.');
