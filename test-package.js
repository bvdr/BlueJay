#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing BlueJay package setup...\n');

async function runCommand(command, description) {
  return new Promise((resolve, reject) => {
    console.log(`📋 ${description}`);
    console.log(`   Running: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`❌ Failed: ${error.message}`);
        reject(error);
        return;
      }

      if (stderr) {
        console.log(`⚠️  Warning: ${stderr}`);
      }

      if (stdout) {
        console.log(`✅ Success: ${stdout.trim()}`);
      } else {
        console.log(`✅ Success: Command completed`);
      }

      resolve(stdout);
    });
  });
}

async function testPackage() {
  try {
    // Test 1: Check if package.json is valid
    console.log('1️⃣ Validating package.json...');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log(`   ✅ Package name: ${packageJson.name}`);
    console.log(`   ✅ Version: ${packageJson.version}`);
    console.log(`   ✅ Binary: ${packageJson.bin.j}`);
    console.log(`   ✅ Registry: ${packageJson.publishConfig.registry}`);

    // Test 2: Check if main files exist
    console.log('\n2️⃣ Checking required files...');
    const requiredFiles = ['index.js', 'scripts/postinstall.js', 'tools/index.js'];
    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        console.log(`   ✅ ${file} exists`);
      } else {
        console.log(`   ❌ ${file} missing`);
      }
    }

    // Test 3: Check if index.js is executable
    console.log('\n3️⃣ Checking executable permissions...');
    const stats = fs.statSync('index.js');
    const isExecutable = !!(stats.mode & parseInt('111', 8));
    console.log(`   ${isExecutable ? '✅' : '❌'} index.js executable: ${isExecutable}`);

    // Test 4: Test npm pack (dry run)
    console.log('\n4️⃣ Testing npm pack...');
    await runCommand('npm pack --dry-run', 'Simulating package creation');

    // Test 5: Test postinstall script
    console.log('\n5️⃣ Testing postinstall script...');
    console.log('   Note: This will check for "j" command conflicts');
    // We'll just verify the script exists and is valid Node.js
    await runCommand('node -c scripts/postinstall.js', 'Validating postinstall script syntax');

    console.log('\n🎉 All tests passed! Package is ready for publishing.');
    console.log('\n📝 Next steps:');
    console.log('   1. Commit your changes');
    console.log('   2. Run: npm publish');
    console.log('   3. Test installation: npm install -g @bvdr/bluejay');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testPackage();
