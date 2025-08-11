#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🍽️  Restaurant Booker Setup');
console.log('Setting up your automated restaurant booking system...\n');

// Create necessary directories
const directories = ['data', 'logs', 'screenshots'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Copy example files
const filesToCopy = [
  { from: 'env.example', to: '.env' },
  { from: 'config.example.json', to: 'config.json' }
];

filesToCopy.forEach(({ from, to }) => {
  if (!fs.existsSync(to)) {
    try {
      fs.copyFileSync(from, to);
      console.log(`✅ Created ${to} from ${from}`);
    } catch (error) {
      console.log(`⚠️  Could not create ${to}: ${error.message}`);
    }
  } else {
    console.log(`⏭️  ${to} already exists, skipping`);
  }
});

console.log('\n📋 Next Steps:');
console.log('1. Edit .env file with your AirMenus credentials');
console.log('2. Edit config.json with your preferences');
console.log('3. Run: npm run book-interactive');
console.log('4. Or run: npm run book -- --restaurant "Restaurant Name" --date "2024-01-15" --time "19:00" --guests 4');

console.log('\n🔧 Available Commands:');
console.log('• npm run book-interactive    - Interactive booking mode');
console.log('• npm run book               - Command line booking');
console.log('• npm run book-batch         - Batch booking from JSON file');
console.log('• npm test                   - Run tests');

console.log('\nFor more information, see README.md');
