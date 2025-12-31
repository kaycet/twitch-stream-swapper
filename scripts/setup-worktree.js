#!/usr/bin/env node
/**
 * Setup script for Vibe Kanban worktrees
 * Ensures package.json exists and installs dependencies if needed
 */

import { existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = process.cwd();

console.log('🔧 Setting up worktree...');
console.log(`   Working directory: ${rootDir}`);

// Check if package.json exists
const packageJsonPath = join(rootDir, 'package.json');

if (!existsSync(packageJsonPath)) {
  console.log('⚠️  package.json not found in worktree');
  console.log('   This might be a Vibe Kanban worktree issue.');
  console.log('   Check that package.json is in copyFiles in .vibe-kanban-config.json');
  console.log('   For now, skipping npm install (Chrome extensions don\'t require it).');
  process.exit(0);
}

console.log('✅ package.json found');

// Check if node_modules exists
const nodeModulesPath = join(rootDir, 'node_modules');
if (!existsSync(nodeModulesPath)) {
  console.log('📦 Installing dependencies...');
  try {
    execSync('npm install', { 
      cwd: rootDir, 
      stdio: 'inherit',
      shell: true 
    });
    console.log('✅ Dependencies installed');
  } catch (error) {
    console.log('⚠️  npm install failed, but continuing...');
    console.log('   This might be okay if dependencies aren\'t needed.');
  }
} else {
  console.log('✅ node_modules already exists');
}

console.log('✅ Setup complete!');

