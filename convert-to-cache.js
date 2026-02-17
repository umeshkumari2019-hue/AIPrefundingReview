#!/usr/bin/env node

/**
 * Convert batch processing results to UI cache format
 * 
 * This script converts JSON results from batch-processor-optimized.js
 * into the cache format expected by the UI.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  RESULTS_DIR: 'Y:\\Umesh\\OneDrive_1_1-21-2026\\Analysis_Results',
  CACHE_DIR: path.join(__dirname, 'data', 'cache'),
  PDF_DIR: 'Y:\\Umesh\\OneDrive_1_1-21-2026',
  MANUAL_VERSION: 'v1.0'
};

// Logger
const logger = {
  log: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warning: (msg) => console.warn(`[WARNING] ${msg}`)
};

// Calculate MD5 hash of a file
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Convert batch result to cache format
function convertToCache(jsonResult, pdfPath) {
  const fileHash = calculateFileHash(pdfPath);
  const pdfFilename = path.basename(pdfPath);
  
  // Build extracted content summary
  const extractedContent = `Application Number: ${jsonResult.applicationNumber}\nFilename: ${pdfFilename}\nProcessed: ${jsonResult.timestamp}`;
  
  // The results structure is already in the correct format
  const cacheData = {
    fileHash: fileHash,
    manualVersion: CONFIG.MANUAL_VERSION,
    timestamp: new Date().toISOString(),
    applicationName: pdfFilename,
    extractedContent: extractedContent,
    results: jsonResult.results
  };
  
  return cacheData;
}

// Main conversion function
async function convertAllResults() {
  logger.log('Starting conversion of batch results to UI cache format');
  logger.log('============================================================');
  
  // Ensure cache directory exists
  if (!fs.existsSync(CONFIG.CACHE_DIR)) {
    fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
    logger.log(`Created cache directory: ${CONFIG.CACHE_DIR}`);
  }
  
  // Find all JSON result files
  const files = fs.readdirSync(CONFIG.RESULTS_DIR);
  const jsonFiles = files.filter(file => 
    file.startsWith('Application-') && file.endsWith('.json')
  );
  
  logger.log(`Found ${jsonFiles.length} result files to convert`);
  
  let converted = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const jsonFile of jsonFiles) {
    try {
      const jsonPath = path.join(CONFIG.RESULTS_DIR, jsonFile);
      const jsonResult = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      
      // Find corresponding PDF
      const pdfFilename = jsonFile.replace('.json', '.pdf');
      const pdfPath = path.join(CONFIG.PDF_DIR, pdfFilename);
      
      if (!fs.existsSync(pdfPath)) {
        logger.warning(`PDF not found for ${jsonFile}, skipping`);
        skipped++;
        continue;
      }
      
      // Calculate hash and create cache filename
      const fileHash = calculateFileHash(pdfPath);
      const cacheFilename = `${fileHash}_${CONFIG.MANUAL_VERSION}.json`;
      const cachePath = path.join(CONFIG.CACHE_DIR, cacheFilename);
      
      // Check if already exists
      if (fs.existsSync(cachePath)) {
        logger.log(`Cache already exists for ${jsonFile}, skipping`);
        skipped++;
        continue;
      }
      
      // Convert to cache format
      const cacheData = convertToCache(jsonResult, pdfPath);
      
      // Write cache file
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
      
      logger.success(`Converted: ${jsonFile} -> ${cacheFilename}`);
      converted++;
      
    } catch (error) {
      logger.error(`Failed to convert ${jsonFile}: ${error.message}`);
      errors++;
    }
  }
  
  logger.log('');
  logger.log('============================================================');
  logger.log('CONVERSION SUMMARY');
  logger.log('============================================================');
  logger.log(`Total files processed: ${jsonFiles.length}`);
  logger.log(`Successfully converted: ${converted}`);
  logger.log(`Skipped (already exists or PDF missing): ${skipped}`);
  logger.log(`Errors: ${errors}`);
  logger.log('============================================================');
  logger.success(`Cache files saved to: ${CONFIG.CACHE_DIR}`);
}

// Run conversion
convertAllResults().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
