#!/usr/bin/env node
/**
 * Basic validation script for Chrome extension
 * Checks that required files exist and manifest is valid
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const requiredFiles = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'popup.css',
  'options.html',
  'options.js',
  'options.css',
  'background.js',
  'utils/storage.js',
  'utils/twitch-api.js',
  'utils/notifications.js'
];

const requiredIcons = [
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'icons/icon-512.png'
];

console.log('🔍 Validating Chrome Extension...\n');

let errors = [];
let warnings = [];

// Check required files
console.log('Checking required files...');
requiredFiles.forEach(file => {
  const path = join(rootDir, file);
  if (!existsSync(path)) {
    errors.push(`Missing required file: ${file}`);
  } else {
    console.log(`  ✅ ${file}`);
  }
});

// Check icons (warn if missing, but don't fail)
console.log('\nChecking icons...');
requiredIcons.forEach(icon => {
  const path = join(rootDir, icon);
  if (!existsSync(path)) {
    warnings.push(`Missing icon: ${icon} (extension may not load in Chrome)`);
    console.log(`  ⚠️  ${icon} (missing)`);
  } else {
    console.log(`  ✅ ${icon}`);
  }
});

// Validate manifest.json
console.log('\nValidating manifest.json...');
try {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifestContent = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent);
  
  if (manifest.manifest_version !== 3) {
    errors.push('Manifest must be version 3');
  }
  
  if (!manifest.name) {
    errors.push('Manifest missing name');
  }
  
  if (!manifest.version) {
    errors.push('Manifest missing version');
  }
  
  console.log('  ✅ manifest.json is valid JSON');
  console.log(`  ✅ Extension: ${manifest.name} v${manifest.version}`);
} catch (error) {
  errors.push(`Invalid manifest.json: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Validation passed! Extension is ready.');
  process.exit(0);
} else {
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(`   ${w}`));
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('\n❌ Validation failed!');
    process.exit(1);
  } else {
    console.log('\n⚠️  Validation passed with warnings.');
    process.exit(0);
  }
}

