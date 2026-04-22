#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  PRIVATE_DIR_MODE,
  PRIVATE_FILE_MODE,
  copyPrivateFile,
  ensurePrivateDirectory,
  tightenPathMode
} = require('./src/utils/privateArtifacts');

console.log('🍽️  Restaurant Booker Setup');
console.log('Setting up your automated restaurant booking system...\n');

// Create necessary directories
const directories = ['data', 'logs', 'screenshots'];
directories.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dir)) {
    ensurePrivateDirectory(dirPath, PRIVATE_DIR_MODE);
    console.log(`✅ Created directory: ${dir}`);
  } else if (tightenPathMode(dirPath, PRIVATE_DIR_MODE)) {
    console.log(`🔒 Tightened directory permissions: ${dir}`);
  }
});

// Copy example files
const filesToCopy = [
  { from: 'env.example', to: '.env', mode: PRIVATE_FILE_MODE },
  { from: 'config.example.json', to: 'config.json', mode: PRIVATE_FILE_MODE }
];

filesToCopy.forEach(({ from, to, mode }) => {
  const toPath = path.join(process.cwd(), to);
  if (!fs.existsSync(to)) {
    try {
      copyPrivateFile(path.join(process.cwd(), from), toPath, mode);
      console.log(`✅ Created ${to} from ${from}`);
    } catch (error) {
      console.log(`⚠️  Could not create ${to}: ${error.message}`);
    }
  } else {
    tightenPathMode(toPath, mode);
    console.log(`⏭️  ${to} already exists, skipping`);
  }
});

console.log('\n📋 Next Steps:');
console.log('1. Edit .env file with your AirMenus credentials');
console.log('2. Edit config.json with your preferences');
console.log('3. Run: npm run book-interactive');
console.log('4. Or run: npm run book -- book --restaurant "Restaurant Name" --date "2026-04-23" --time "19:00" --guests 4');

console.log('\n🔧 Available Commands:');
console.log('• npm run book-interactive    - Interactive booking mode');
console.log('• npm run book               - Command line booking');
console.log('• npm run book-batch         - Batch booking from JSON file');
console.log('• npm test                   - Run tests');

console.log('\nFor more information, see README.md');
