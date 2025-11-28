#!/usr/bin/env node
/**
 * Fix alternate app icons by adding iPad support
 * This prevents App Store Connect warnings about missing 152x152 and 167x167 icons
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, '../ios/App/App/Assets.xcassets');
const ALTERNATE_ICONS = ['Icon2', 'Icon3', 'Icon4', 'Icon5', 'Icon6', 'Icon7', 'Icon8'];

// iPad sizes needed for App Store compliance
const IPAD_SIZES = [
  { size: '20x20', scale: '1x', filename: 'icon-20.png', pixels: 20 },
  { size: '20x20', scale: '2x', filename: 'icon-40.png', pixels: 40 },
  { size: '29x29', scale: '1x', filename: 'icon-29.png', pixels: 29 },
  { size: '29x29', scale: '2x', filename: 'icon-58.png', pixels: 58 },
  { size: '40x40', scale: '1x', filename: 'icon-40.png', pixels: 40 },
  { size: '40x40', scale: '2x', filename: 'icon-80.png', pixels: 80 },
  { size: '76x76', scale: '1x', filename: 'icon-76.png', pixels: 76 },
  { size: '76x76', scale: '2x', filename: 'icon-152.png', pixels: 152 }, // Required by Apple
  { size: '83.5x83.5', scale: '2x', filename: 'icon-167.png', pixels: 167 }, // Required by Apple (iPad Pro)
];

function updateContentsJson(iconName) {
  const iconDir = path.join(ASSETS_DIR, `${iconName}.appiconset`);
  const contentsPath = path.join(iconDir, 'Contents.json');

  console.log(`\nUpdating ${iconName}...`);

  if (!fs.existsSync(contentsPath)) {
    console.error(`  ✗ Contents.json not found for ${iconName}`);
    return false;
  }

  const contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'));

  // Remove any existing iPad entries to avoid duplicates
  contents.images = contents.images.filter(img => img.idiom !== 'ipad');

  // Add iPad entries
  IPAD_SIZES.forEach(({ size, scale, filename }) => {
    contents.images.push({
      idiom: 'ipad',
      scale,
      size,
      filename: `${iconName.toLowerCase()}-${filename}`,
    });
  });

  // Write updated Contents.json
  fs.writeFileSync(contentsPath, JSON.stringify(contents, null, 2) + '\n');
  console.log(`  ✓ Updated Contents.json`);

  return true;
}

function generateIpadIcons(iconName) {
  const iconDir = path.join(ASSETS_DIR, `${iconName}.appiconset`);

  // Find source 1024x1024 image
  const files = fs.readdirSync(iconDir);
  const source1024 = files.find(f =>
    (f.includes('1024') || f.includes('marketing')) && f.endsWith('.png')
  );

  if (!source1024) {
    // Try to find the largest existing icon
    const largest = files.find(f => f.endsWith('@3x.png') || f.endsWith('-180.png'));
    if (!largest) {
      console.error(`  ✗ No source image found for ${iconName}`);
      return false;
    }
    console.log(`  ⚠ Using ${largest} as source (no 1024x1024 found)`);
  }

  const sourcePath = path.join(iconDir, source1024 || files[files.length - 1]);

  console.log(`  Generating iPad icons from ${source1024 || 'existing icon'}...`);

  // Use sips (macOS built-in tool) to resize icons
  IPAD_SIZES.forEach(({ pixels, filename }) => {
    const outputPath = path.join(iconDir, `${iconName.toLowerCase()}-${filename}`);

    // Skip if already exists and is the right size
    if (fs.existsSync(outputPath)) {
      try {
        const existingInfo = execSync(`sips -g pixelWidth "${outputPath}"`, { encoding: 'utf8' });
        const existingSize = parseInt(existingInfo.match(/pixelWidth: (\d+)/)?.[1] || '0');
        if (existingSize === pixels) {
          console.log(`    ✓ ${pixels}x${pixels} already exists`);
          return;
        }
      } catch (e) {
        // File exists but couldn't read it, regenerate
      }
    }

    try {
      execSync(
        `sips -z ${pixels} ${pixels} "${sourcePath}" --out "${outputPath}"`,
        { stdio: 'pipe' }
      );
      console.log(`    ✓ Generated ${pixels}x${pixels}`);
    } catch (error) {
      console.error(`    ✗ Failed to generate ${pixels}x${pixels}: ${error.message}`);
    }
  });

  return true;
}

function main() {
  console.log('🔧 Fixing alternate app icons for iPad support...\n');
  console.log('This adds 152x152 and 167x167 icons to prevent App Store warnings.\n');

  let successCount = 0;
  let failCount = 0;

  ALTERNATE_ICONS.forEach(iconName => {
    const updated = updateContentsJson(iconName);
    if (updated) {
      const generated = generateIpadIcons(iconName);
      if (generated) {
        successCount++;
      } else {
        failCount++;
      }
    } else {
      failCount++;
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Successfully updated ${successCount} alternate icon${successCount !== 1 ? 's' : ''}`);
  if (failCount > 0) {
    console.log(`❌ Failed to update ${failCount} alternate icon${failCount !== 1 ? 's' : ''}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  console.log('Next steps:');
  console.log('1. Run "npx cap sync ios" to sync changes');
  console.log('2. Open Xcode and clean build folder (Cmd+Shift+K)');
  console.log('3. Archive and upload to App Store Connect');
  console.log('4. Warnings about 152x152 and 167x167 should be gone!\n');
}

main();
