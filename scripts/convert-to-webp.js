/*
🔄 PNG to WebP Converter

Usage:
  yarn convert-to-webp <directory-path>

Example:
  yarn convert-to-webp ./assets/

All PNG files in the specified directory will be converted to WebP in the same directory.
*/
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  quality: 80,
  lossless: false,
};

function findPngFiles(dir) {
  const pngFiles = [];
  
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }
  
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dir}`);
  }
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const itemStat = fs.statSync(fullPath);
    
    if (itemStat.isFile() && path.extname(item).toLowerCase() === '.png') {
      pngFiles.push(fullPath);
    }
  }
  
  return pngFiles;
}

async function convertToWebP(inputPath) {
  const dir = path.dirname(inputPath);
  const name = path.basename(inputPath, '.png');
  const outputPath = path.join(dir, `${name}.webp`);
  
  try {
    const info = await sharp(inputPath)
      .webp({ 
        quality: CONFIG.quality,
        lossless: CONFIG.lossless 
      })
      .toFile(outputPath);
    
    const inputSize = fs.statSync(inputPath).size;
    const outputSize = info.size;
    const compressionRatio = ((inputSize - outputSize) / inputSize * 100).toFixed(1);
    
    console.log(`✅ ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
    console.log(`   Size: ${(inputSize / 1024).toFixed(1)}KB → ${(outputSize / 1024).toFixed(1)}KB (compression: ${compressionRatio}%)`);
    
    return { success: true, inputSize, outputSize, inputPath, outputPath };
  } catch (error) {
    console.error(`❌ Error converting ${path.basename(inputPath)}:`, error.message);
    return { success: false, error: error.message, inputPath };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  const inputDir = args[0];
  
  if (!inputDir) {
    console.error('❌ Error: Directory path with PNG files is required');
    process.exit(1);
  }
  
  try {
    const resolvedInputDir = path.resolve(inputDir);
    
    console.log('🔄 Searching for PNG files...');
    console.log(`📁 Directory: ${resolvedInputDir}\n`);
    
    const pngFiles = findPngFiles(resolvedInputDir);
    
    if (pngFiles.length === 0) {
      console.log('ℹ️  No PNG files found in specified directory.');
      return;
    }
    
    console.log(`📋 Found PNG files: ${pngFiles.length}\n`);
    
    let totalInputSize = 0;
    let totalOutputSize = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (const pngFile of pngFiles) {
      const result = await convertToWebP(pngFile);
      
      if (result.success) {
        successCount++;
        totalInputSize += result.inputSize;
        totalOutputSize += result.outputSize;
      } else {
        errorCount++;
      }
      
      console.log('');
    }
    
    console.log('📊 CONVERSION STATISTICS:');
    console.log(`✅ Successfully converted: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }
    
    if (successCount > 0) {
      const totalCompressionRatio = ((totalInputSize - totalOutputSize) / totalInputSize * 100).toFixed(1);
      console.log(`💾 Total size before: ${(totalInputSize / 1024).toFixed(1)}KB`);
      console.log(`💾 Total size after: ${(totalOutputSize / 1024).toFixed(1)}KB`);
      console.log(`🎯 Total compression: ${totalCompressionRatio}%`);
      console.log(`💰 Saved: ${((totalInputSize - totalOutputSize) / 1024).toFixed(1)}KB`);
    }
    
    console.log('\n✨ Conversion completed!');
    
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
