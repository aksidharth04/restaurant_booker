#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.cyan('🍽️  Restaurant Booker Setup'));
console.log(chalk.gray('Setting up your automated restaurant booking system...\n'));

// Create necessary directories
const directories = ['data', 'logs', 'screenshots'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(chalk.green(`✅ Created directory: ${dir}`));
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
      console.log(chalk.green(`✅ Created ${to} from ${from}`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not create ${to}: ${error.message}`));
    }
  } else {
    console.log(chalk.gray(`⏭️  ${to} already exists, skipping`));
  }
});

console.log(chalk.cyan('\n📋 Next Steps:'));
console.log(chalk.white('1. Edit .env file with your AirMenus credentials'));
console.log(chalk.white('2. Edit config.json with your preferences'));
console.log(chalk.white('3. Run: npm run book-interactive'));
console.log(chalk.white('4. Or run: npm run book -- --restaurant "Restaurant Name" --date "2024-01-15" --time "19:00" --guests 4'));

console.log(chalk.cyan('\n🔧 Available Commands:'));
console.log(chalk.white('• npm run book-interactive    - Interactive booking mode'));
console.log(chalk.white('• npm run book               - Command line booking'));
console.log(chalk.white('• npm run book-batch         - Batch booking from JSON file'));
console.log(chalk.white('• npm test                   - Run tests'));

console.log(chalk.gray('\nFor more information, see README.md'));
