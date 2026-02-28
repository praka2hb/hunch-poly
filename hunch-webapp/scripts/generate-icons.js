/**
 * Script to generate PWA icons from a source image
 * 
 * Requirements:
 * - Install sharp: npm install --save-dev sharp
 * - Place your source icon as public/icon.png (or update SOURCE_IMAGE path)
 * 
 * Usage: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = path.join(__dirname, '../public/icon.png');
const OUTPUT_DIR = path.join(__dirname, '../public');

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  try {
    // Check if source image exists
    if (!fs.existsSync(SOURCE_IMAGE)) {
      console.error(`Source image not found: ${SOURCE_IMAGE}`);
      console.log('Please ensure icon.png exists in the public directory');
      process.exit(1);
    }

    console.log('Generating PWA icons...');

    // Generate icons for each size
    for (const size of ICON_SIZES) {
      const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);
      
      await sharp(SOURCE_IMAGE)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 1 } // Black background
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Generated icon-${size}x${size}.png`);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('\nNote: Make sure to test the icons and adjust the background color if needed.');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
