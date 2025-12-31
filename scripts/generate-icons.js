#!/usr/bin/env node

/**
 * Icon Generation Script
 * 
 * Converts SVG icon source to all required PNG sizes for Chrome extension.
 * Reads icons/icon-source.svg and outputs PNG files to icons/ directory.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON_SIZES = [16, 48, 128, 512];
const SOURCE_SVG = path.join(__dirname, '..', 'icons', 'icon-source.svg');
const ICONS_DIR = path.join(__dirname, '..', 'icons');

/**
 * Ensures the icons directory exists
 */
function ensureIconsDirectory() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    console.log(`Created icons directory: ${ICONS_DIR}`);
  }
}

/**
 * Checks if the source SVG file exists
 */
function checkSourceFile() {
  if (!fs.existsSync(SOURCE_SVG)) {
    console.error(`Error: Source SVG file not found at ${SOURCE_SVG}`);
    console.error('Please create icons/icon-source.svg before running this script.');
    process.exit(1);
  }
}

/**
 * Generates PNG icon from SVG at specified size
 * @param {number} size - Target size in pixels (width and height)
 * @returns {Promise<void>}
 */
async function generateIcon(size) {
  const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
  
  try {
    await sharp(SOURCE_SVG)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(outputPath);
    
    console.log(`✓ Generated icon-${size}.png (${size}x${size})`);
  } catch (error) {
    console.error(`✗ Failed to generate icon-${size}.png:`, error.message);
    throw error;
  }
}

/**
 * Main function to generate all icon sizes
 */
async function main() {
  console.log('Starting icon generation...\n');
  
  // Validate source file exists
  checkSourceFile();
  
  // Ensure icons directory exists
  ensureIconsDirectory();
  
  console.log(`Source: ${SOURCE_SVG}`);
  console.log(`Output: ${ICONS_DIR}\n`);
  
  // Generate all icon sizes
  try {
    for (const size of ICON_SIZES) {
      await generateIcon(size);
    }
    
    console.log('\n✓ All icons generated successfully!');
    console.log(`\nGenerated files:`);
    ICON_SIZES.forEach(size => {
      const filePath = path.join(ICONS_DIR, `icon-${size}.png`);
      const stats = fs.statSync(filePath);
      console.log(`  - icon-${size}.png (${(stats.size / 1024).toFixed(2)} KB)`);
    });
  } catch (error) {
    console.error('\n✗ Icon generation failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { generateIcon, ICON_SIZES };
