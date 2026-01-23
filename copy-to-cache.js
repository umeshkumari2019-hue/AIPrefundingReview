import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = 'Y:\\Umesh\\OneDrive_1_1-21-2026\\Analysis_Results';
const CACHE_DIR = 'Y:\\Umesh\\hrsa-compliance-react\\data\\cache';

// Logger utility
const logger = {
  log: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  warning: (msg) => console.warn(`[WARNING] ${msg}`)
};

// Generate hash for filename
function generateHash(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

// Convert batch analysis format to UI cache format
function convertToUIFormat(batchData, filename) {
  const fileHash = generateHash(filename);
  
  // Convert sections from batch format to UI format
  const results = {};
  
  if (batchData.sections) {
    Object.keys(batchData.sections).forEach(sectionName => {
      const section = batchData.sections[sectionName];
      
      // Convert to UI format with compliantItems, nonCompliantItems, notApplicableItems
      results[sectionName] = {
        compliantItems: [],
        nonCompliantItems: [],
        notApplicableItems: []
      };
      
      // Convert compliant items
      if (section.compliant && Array.isArray(section.compliant)) {
        results[sectionName].compliantItems = section.compliant.map(item => ({
          element: item.element,
          requirement: item.requirement,
          status: 'COMPLIANT',
          whatWasChecked: item.requirement,
          evidence: item.evidence || '',
          evidenceLocation: 'Not specified',
          reasoning: item.reasoning || '',
          sectionsReferenced: 'Not specified',
          contentTypes: 'Not specified'
        }));
      }
      
      // Convert non-compliant items
      if (section.nonCompliant && Array.isArray(section.nonCompliant)) {
        results[sectionName].nonCompliantItems = section.nonCompliant.map(item => ({
          element: item.element,
          requirement: item.requirement,
          status: 'NON-COMPLIANT',
          whatWasChecked: item.requirement,
          evidence: item.evidence || '',
          evidenceLocation: 'Not specified',
          reasoning: item.reasoning || '',
          sectionsReferenced: 'Not specified',
          contentTypes: 'Not specified'
        }));
      }
      
      // Convert not applicable items
      if (section.notApplicable && Array.isArray(section.notApplicable)) {
        results[sectionName].notApplicableItems = section.notApplicable.map(item => ({
          element: item.element,
          requirement: item.requirement,
          status: 'NOT_APPLICABLE',
          whatWasChecked: item.requirement,
          evidence: item.evidence || '',
          evidenceLocation: 'Not specified',
          reasoning: item.reasoning || '',
          sectionsReferenced: 'Not specified',
          contentTypes: 'Not specified'
        }));
      }
    });
  }
  
  // Create UI cache format
  return {
    fileHash: fileHash,
    manualVersion: 'v1.0',
    timestamp: new Date().toISOString(),
    applicationName: batchData.filename || filename,
    extractedContent: `Application Number: ${batchData.applicationNumber}\nFilename: ${batchData.filename}\nProcessed: ${batchData.timestamp}`,
    results: results
  };
}

// Main function
async function main() {
  try {
    logger.log('Starting conversion of batch analysis results to UI cache format');
    logger.log('============================================================');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      logger.log(`Created cache directory: ${CACHE_DIR}`);
    }
    
    // Find all JSON files in source directory
    const files = fs.readdirSync(SOURCE_DIR)
      .filter(file => file.endsWith('.json') && !file.includes('batch_summary'));
    
    if (files.length === 0) {
      logger.warning('No JSON files found in source directory');
      return;
    }
    
    logger.log(`Found ${files.length} analysis files to convert`);
    
    let converted = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const file of files) {
      try {
        const sourcePath = path.join(SOURCE_DIR, file);
        const batchData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        
        // Convert to UI format
        const uiData = convertToUIFormat(batchData, file);
        
        // Generate cache filename
        const cacheFilename = `${uiData.fileHash}_v1.0.json`;
        const cachePath = path.join(CACHE_DIR, cacheFilename);
        
        // Check if already exists
        if (fs.existsSync(cachePath)) {
          logger.log(`⏭️  Skipping (already exists): ${file} -> ${cacheFilename}`);
          skipped++;
          continue;
        }
        
        // Write to cache
        fs.writeFileSync(cachePath, JSON.stringify(uiData, null, 2));
        
        logger.success(`✓ Converted: ${file} -> ${cacheFilename}`);
        logger.log(`   Application: ${batchData.applicationNumber}`);
        converted++;
        
      } catch (error) {
        logger.error(`✗ Failed to convert ${file}: ${error.message}`);
        errors++;
      }
    }
    
    logger.log('');
    logger.log('============================================================');
    logger.log('Conversion Complete');
    logger.log('============================================================');
    logger.log(`Total Files: ${files.length}`);
    logger.log(`Converted: ${converted}`);
    logger.log(`Skipped (already exist): ${skipped}`);
    logger.log(`Errors: ${errors}`);
    logger.log('============================================================');
    logger.success(`Cache directory: ${CACHE_DIR}`);
    logger.log('You can now view these analyses in the UI!');
    
  } catch (error) {
    logger.error(`Error during conversion: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
