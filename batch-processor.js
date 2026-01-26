#!/usr/bin/env node

/**
 * HRSA Pre-Funding Review - Batch Processing Utility
 * 
 * This utility processes multiple application PDFs in batch mode with:
 * - Rate limiting to handle API token limits
 * - Word document generation for each application
 * - Structured JSON output for Excel comparison
 * - Processing log with timestamps
 * 
 * Usage: node batch-processor.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import FormData from 'form-data';
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx';
import readline from 'readline';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  BACKEND_URL: process.env.BACKEND_URL,
  AZURE_DOC_ENDPOINT: process.env.AZURE_DOC_ENDPOINT,
  AZURE_DOC_KEY: process.env.AZURE_DOC_KEY,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_KEY,
  AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,

  // Rate limiting settings
  DELAY_BETWEEN_REQUESTS: 2000, // 2 seconds between API calls
  DELAY_BETWEEN_APPLICATIONS: 5000, // 5 seconds between applications
  MAX_RETRIES: 3,
  RETRY_DELAY: 10000, // 10 seconds retry delay
  
  // Limit processing to 1 application for testing/comparison
  MAX_APPLICATIONS: null, // Set to null or 0 to process all applications
};

const SECTIONS = [
  'Needs Assessment',
  'Sliding Fee Discount Program',
  'Key Management Staff',
  'Contracts and Subawards',
  'Collaborative Relationships',
  'Billing and Collections',
  'Budget',
  'Board Authority',
  'Board Composition'
];

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisified question
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Text compression utility to reduce payload size
function compressApplicationText(fullText) {
  let compressed = fullText;
  
  // Remove page markers and separators
  compressed = compressed.replace(/={10,}/g, '');
  compressed = compressed.replace(/PAGE \d+/gi, '');
  compressed = compressed.replace(/Page Number:\s*\d+/gi, '');
  compressed = compressed.replace(/Tracking Number[^\n]*/gi, '');
  
  // Remove excessive whitespace and blank lines
  compressed = compressed.replace(/\n{3,}/g, '\n\n');
  compressed = compressed.replace(/[ \t]{2,}/g, ' ');
  compressed = compressed.replace(/^\s+$/gm, ''); // Remove whitespace-only lines
  
  // Remove page headers/footers (common patterns)
  compressed = compressed.replace(/Page \d+ of \d+/gi, '');
  compressed = compressed.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ''); // Dates
  
  // Remove table formatting characters but keep content
  compressed = compressed.replace(/[│┤├┼─┌┐└┘]/g, ' ');
  compressed = compressed.replace(/\[TEXT\]\s*/g, ''); // Remove [TEXT] markers
  compressed = compressed.replace(/\[TABLE[^\]]*\]:\s*/g, 'TABLE: '); // Simplify table markers
  
  // Remove excessive repetition (e.g., "___________" lines)
  compressed = compressed.replace(/_{5,}/g, '');
  compressed = compressed.replace(/-{5,}/g, '');
  compressed = compressed.replace(/\.{5,}/g, '');
  
  // Remove multiple spaces (do this last)
  compressed = compressed.replace(/  +/g, ' ');
  compressed = compressed.replace(/\n /g, '\n'); // Remove leading spaces on lines
  
  // Remove empty lines
  compressed = compressed.split('\n').filter(line => line.trim().length > 0).join('\n');
  
  return compressed.trim();
}

// Logging utility
class Logger {
  constructor(logFilePath) {
    this.logFilePath = logFilePath;
    this.logs = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    console.log(logEntry);
    this.logs.push({ timestamp, level, message });
  }

  error(message) {
    this.log(message, 'ERROR');
  }

  success(message) {
    this.log(message, 'SUCCESS');
  }

  warning(message) {
    this.log(message, 'WARNING');
  }

  async saveLog() {
    const logContent = this.logs.map(log => 
      `[${log.timestamp}] [${log.level}] ${log.message}`
    ).join('\n');
    
    await fs.promises.writeFile(this.logFilePath, logContent, 'utf8');
    this.log(`Log saved to: ${this.logFilePath}`);
  }
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extract application number from filename
function extractApplicationNumber(filename) {
  // Try to extract number patterns like "242897" or "24-2897"
  const patterns = [
    /(\d{6})/,           // 6 digits
    /(\d{2}-\d{4})/,     // XX-XXXX format
    /(\d{7})/,           // 7 digits
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Load manual rules from JSON file
async function loadManualRules() {
  try {
    // Try multiple possible locations
    const possiblePaths = [
      path.join(__dirname, 'data', 'compliance-rules.json'),
      path.join(__dirname, 'compliance-rules.json'),
      path.join(__dirname, '..', 'data', 'compliance-rules.json')
    ];
    
    for (const rulesPath of possiblePaths) {
      if (fs.existsSync(rulesPath)) {
        const data = await fs.promises.readFile(rulesPath, 'utf8');
        return JSON.parse(data);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error loading manual rules:', error);
    return null;
  }
}

// Extract text from PDF using Azure Document Intelligence
async function extractTextFromPDF(pdfBuffer, filename, logger) {
  try {
    // Step 1: Submit document for analysis
    const analyzeUrl = `${CONFIG.AZURE_DOC_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
    
    const analyzeResponse = await axios.post(analyzeUrl, pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Ocp-Apim-Subscription-Key': CONFIG.AZURE_DOC_KEY
      },
      maxBodyLength: Infinity
    });
    
    const operationLocation = analyzeResponse.headers['operation-location'];
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }
    
    // Step 2: Poll for results
    let result = null;
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      await sleep(2000); // Wait 2 seconds between polls
      
      const resultResponse = await axios.get(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': CONFIG.AZURE_DOC_KEY
        }
      });
      
      if (resultResponse.data.status === 'succeeded') {
        result = resultResponse.data;
        break;
      } else if (resultResponse.data.status === 'failed') {
        throw new Error('Azure Document Intelligence analysis failed');
      }
      
      attempts++;
    }
    
    if (!result) {
      throw new Error('Timeout waiting for Azure Document Intelligence results');
    }
    
    // Step 3: Extract text content
    const pages = result.analyzeResult?.pages || [];
    const paragraphs = result.analyzeResult?.paragraphs || [];
    const tables = result.analyzeResult?.tables || [];
    
    let contentWithPages = '';
    
    if (paragraphs.length > 0) {
      const pageContent = {};
      
      paragraphs.forEach(para => {
        const pageNum = para.boundingRegions?.[0]?.pageNumber || 1;
        if (!pageContent[pageNum]) pageContent[pageNum] = [];
        
        let contentType = '[TEXT]';
        if (para.role === 'title' || para.role === 'sectionHeading') {
          contentType = '[HEADING]';
        }
        
        pageContent[pageNum].push({
          type: contentType,
          content: para.content
        });
      });
      
      tables.forEach((table, tableIndex) => {
        const pageNum = table.boundingRegions?.[0]?.pageNumber || 1;
        if (!pageContent[pageNum]) pageContent[pageNum] = [];
        
        const rows = table.cells || [];
        const tableData = {};
        rows.forEach(cell => {
          const rowIdx = cell.rowIndex || 0;
          const colIdx = cell.columnIndex || 0;
          if (!tableData[rowIdx]) tableData[rowIdx] = [];
          tableData[rowIdx][colIdx] = cell.content || '';
        });
        
        let tableText = `Table ${tableIndex + 1}:\n`;
        Object.keys(tableData).forEach(rowIdx => {
          tableText += tableData[rowIdx].join(' | ') + '\n';
        });
        
        pageContent[pageNum].push({
          type: '[TABLE]',
          content: tableText
        });
      });
      
      const sortedPages = Object.keys(pageContent).sort((a, b) => parseInt(a) - parseInt(b));
      sortedPages.forEach(pageNum => {
        contentWithPages += `\n\n========== PAGE ${pageNum} ==========\n\n`;
        pageContent[pageNum].forEach(item => {
          contentWithPages += `${item.type} ${item.content}\n\n`;
        });
      });
    } else {
      contentWithPages = result.analyzeResult?.content || '';
    }
    
    return contentWithPages;
  } catch (error) {
    logger.error(`Azure extraction error: ${error.message}`);
    throw error;
  }
}

// Validate compliance using Azure OpenAI
async function validateCompliance(applicationText, chapter, section, logger) {
  try {
    const prompt = `You are analyzing a health center application for compliance with HRSA requirements.

SECTION: ${section}

REQUIREMENTS TO CHECK:
${chapter.elements.map((elem, idx) => `${idx + 1}. ${elem.element}: ${elem.requirementText}`).join('\n')}

APPLICATION TEXT:
${applicationText}

For each requirement listed above, determine:
1. Is it COMPLIANT, NON-COMPLIANT, or NOT APPLICABLE?
2. What evidence supports this determination?
3. What is the reasoning?

IMPORTANT: In your response, the "element" field MUST contain the COMPLETE element name exactly as shown in the requirements list above (e.g., "Element b - Update of Needs Assessment", NOT just "b" or "Element b").

Return a JSON object with this exact structure:
{
  "compliantItems": [{"element": "FULL element name from list", "requirement": "requirement text", "evidence": "specific evidence from application", "reasoning": "your analysis"}],
  "nonCompliantItems": [{"element": "FULL element name from list", "requirement": "requirement text", "evidence": "specific evidence or lack thereof", "reasoning": "your analysis"}],
  "notApplicableItems": [{"element": "FULL element name from list", "requirement": "requirement text", "evidence": "why not applicable", "reasoning": "your analysis"}]
}`;

    const response = await axios.post(
      `${CONFIG.AZURE_OPENAI_ENDPOINT}/openai/deployments/${CONFIG.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        messages: [
          { role: 'system', content: 'You are a compliance analyst for HRSA health center applications.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': CONFIG.AZURE_OPENAI_KEY
        }
      }
    );
    
    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      
      // Post-process to ensure element names are complete
      const fixElementName = (item) => {
        // Find matching element from chapter.elements
        const matchingElement = chapter.elements.find(elem => 
          elem.element.toLowerCase().includes(item.element.toLowerCase()) ||
          item.element.toLowerCase().includes(elem.element.toLowerCase().substring(0, 15))
        );
        
        if (matchingElement && item.element !== matchingElement.element) {
          logger.warning(`Fixed incomplete element name: "${item.element}" -> "${matchingElement.element}"`);
          item.element = matchingElement.element;
        }
        return item;
      };
      
      if (result.compliantItems) result.compliantItems = result.compliantItems.map(fixElementName);
      if (result.nonCompliantItems) result.nonCompliantItems = result.nonCompliantItems.map(fixElementName);
      if (result.notApplicableItems) result.notApplicableItems = result.notApplicableItems.map(fixElementName);
      
      return result;
    }
    
    throw new Error('Failed to parse AI response');
  } catch (error) {
    logger.error(`Azure OpenAI error: ${error.message}`);
    throw error;
  }
}

// Analyze single application with parallel processing
async function analyzeApplication(pdfPath, manualRules, logger) {
  const filename = path.basename(pdfPath);
  const applicationNumber = extractApplicationNumber(filename);
  
  logger.log(`Analyzing: ${filename} (App #: ${applicationNumber || 'Unknown'})`);
  
  const startTime = Date.now();
  
  try {
    // Read PDF file
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    
    // Extract text from PDF using Azure Document Intelligence
    logger.log(`Extracting text from PDF...`);
    const extractionStartTime = Date.now();
    const extractedText = await extractTextFromPDF(pdfBuffer, filename, logger);
    const extractionTime = ((Date.now() - extractionStartTime) / 1000).toFixed(1);
    logger.log(`Extracted ${extractedText.length} characters from PDF (took ${extractionTime}s)`);
    
    // Compress text to reduce API payload size
    const compressedText = compressApplicationText(extractedText);
    const compressionRatio = ((1 - compressedText.length / extractedText.length) * 100).toFixed(1);
    logger.log(`Compressed text: ${extractedText.length} → ${compressedText.length} chars (${compressionRatio}% reduction)`);
    
    // Calculate safe batch size based on text size
    const estimatedTokens = Math.ceil(compressedText.length / 4);
    const BATCH_SIZE = 1; // Sequential processing to avoid rate limits
    logger.log(`Estimated tokens: ~${estimatedTokens}, Using batch size: ${BATCH_SIZE} (sequential mode)`);
    
    await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    
    // Analyze sections in parallel batches
    const results = {};
    const analysisStartTime = Date.now();
    
    for (let i = 0; i < SECTIONS.length; i += BATCH_SIZE) {
      const batch = SECTIONS.slice(i, i + BATCH_SIZE);
      const batchStartTime = Date.now();
      logger.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(SECTIONS.length / BATCH_SIZE)}: [${batch.join(', ')}]`);
      
      const batchPromises = batch.map(async (section, batchIndex) => {
        const chapter = manualRules.find(ch => ch.section === section);
        if (!chapter) {
          logger.warning(`No rules found for section: ${section}`);
          return { section, result: null };
        }
        
        // Stagger requests within batch to avoid simultaneous API hits
        await sleep(batchIndex * 1500);
        
        let retries = 0;
        while (retries <= CONFIG.MAX_RETRIES) {
          try {
            logger.log(`Analyzing section ${SECTIONS.indexOf(section) + 1}/${SECTIONS.length}: ${section}`);
            const validationResult = await validateCompliance(compressedText, chapter, section, logger);
            logger.log(`✓ Completed: ${section}`);
            return { section, result: validationResult };
          } catch (error) {
            // Handle rate limits with exponential backoff
            if (error.response?.status === 429) {
              retries++;
              const backoffTime = CONFIG.RETRY_DELAY * retries;
              logger.warning(`Rate limit hit on ${section}. Waiting ${backoffTime / 1000}s (retry ${retries}/${CONFIG.MAX_RETRIES})`);
              await sleep(backoffTime);
            } else if (retries < CONFIG.MAX_RETRIES) {
              retries++;
              logger.warning(`Error on ${section}: ${error.message}. Retrying in 5s...`);
              await sleep(5000);
            } else {
              logger.error(`Failed ${section} after ${CONFIG.MAX_RETRIES} retries: ${error.message}`);
              return { section, result: { error: error.message } };
            }
          }
        }
      });
      
      // Wait for all sections in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Store results
      batchResults.forEach(item => {
        if (item && item.result) {
          results[item.section] = item.result;
        }
      });
      
      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      logger.log(`✓ Batch completed in ${batchTime}s`);
      
      // Wait between batches to stay under rate limits (25s to stay under 450K TPM)
      if (i + BATCH_SIZE < SECTIONS.length) {
        const delayTime = 25000; // 25 second delay between sections
        logger.log(`Waiting ${delayTime/1000}s before next section...`);
        await sleep(delayTime);
      }
    }
    
    const totalAnalysisTime = ((Date.now() - analysisStartTime) / 1000).toFixed(1);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.log(`⏱️  Analysis completed in ${totalAnalysisTime}s (Total: ${totalTime}s)`);
    
    return {
      applicationNumber,
      filename,
      timestamp: new Date().toISOString(),
      results
    };
    
  } catch (error) {
    logger.error(`Failed to analyze ${filename}: ${error.message}`);
    throw error;
  }
}

// Generate Word document for analysis results
async function generateWordDocument(analysisResult, outputPath, logger) {
  try {
    const sections = [];
    
    // Title
    sections.push(
      new Paragraph({
        text: `HRSA Pre-Funding Review Report`,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      })
    );
    
    sections.push(
      new Paragraph({
        text: `Application: ${analysisResult.applicationNumber || analysisResult.filename}`,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    );
    
    // Summary Statistics
    let totalCompliant = 0;
    let totalNonCompliant = 0;
    let totalNotApplicable = 0;
    
    SECTIONS.forEach(section => {
      const result = analysisResult.results[section];
      if (result && !result.error) {
        totalCompliant += result.compliantItems?.length || 0;
        totalNonCompliant += result.nonCompliantItems?.length || 0;
        totalNotApplicable += result.notApplicableItems?.length || 0;
      }
    });
    
    const totalItems = totalCompliant + totalNonCompliant + totalNotApplicable;
    
    sections.push(
      new Paragraph({
        text: 'Summary Statistics',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 }
      })
    );
    
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Total Requirements: `, bold: true }),
          new TextRun({ text: `${totalItems}` })
        ],
        spacing: { after: 100 }
      })
    );
    
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `✅ Compliant: `, bold: true }),
          new TextRun({ text: `${totalCompliant}` })
        ],
        spacing: { after: 100 }
      })
    );
    
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `❌ Non-Compliant: `, bold: true }),
          new TextRun({ text: `${totalNonCompliant}` })
        ],
        spacing: { after: 100 }
      })
    );
    
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `⊘ Not Applicable: `, bold: true }),
          new TextRun({ text: `${totalNotApplicable}` })
        ],
        spacing: { after: 400 }
      })
    );
    
    // Detailed Results by Section
    SECTIONS.forEach(section => {
      const result = analysisResult.results[section];
      if (!result || result.error) return;
      
      const allItems = [
        ...(result.compliantItems || []).map(item => ({ ...item, type: 'COMPLIANT' })),
        ...(result.nonCompliantItems || []).map(item => ({ ...item, type: 'NON_COMPLIANT' })),
        ...(result.notApplicableItems || []).map(item => ({ ...item, type: 'NOT_APPLICABLE' }))
      ];
      
      if (allItems.length === 0) return;
      
      sections.push(
        new Paragraph({
          text: section,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
      
      allItems.forEach((item) => {
        const statusText = item.type === 'COMPLIANT' ? '✅ COMPLIANT' : 
                         item.type === 'NOT_APPLICABLE' ? '⊘ NOT APPLICABLE' : 
                         '❌ NON-COMPLIANT';
        
        sections.push(
          new Paragraph({
            text: `${item.element}`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 }
          })
        );
        
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Status: `, bold: true }),
              new TextRun({ text: statusText })
            ],
            spacing: { after: 100 }
          })
        );
        
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Requirement: `, bold: true }),
              new TextRun({ text: item.requirement || 'Not specified' })
            ],
            spacing: { after: 100 }
          })
        );
        
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Evidence: `, bold: true }),
              new TextRun({ text: item.evidence || 'No evidence found' })
            ],
            spacing: { after: 100 }
          })
        );
        
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Reasoning: `, bold: true }),
              new TextRun({ text: item.reasoning || 'Not specified' })
            ],
            spacing: { after: 200 }
          })
        );
      });
    });
    
    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: sections
      }]
    });
    
    // Generate and save
    const buffer = await Packer.toBuffer(doc);
    await fs.promises.writeFile(outputPath, buffer);
    
    logger.success(`Word document saved: ${outputPath}`);
    
  } catch (error) {
    logger.error(`Failed to generate Word document: ${error.message}`);
    throw error;
  }
}

// Save structured JSON for Excel comparison
async function saveStructuredJSON(analysisResult, outputPath, logger) {
  try {
    const structuredData = {
      applicationNumber: analysisResult.applicationNumber,
      filename: analysisResult.filename,
      timestamp: analysisResult.timestamp,
      summary: {
        totalCompliant: 0,
        totalNonCompliant: 0,
        totalNotApplicable: 0,
        complianceRate: 0
      },
      sections: {}
    };
    
    // Process each section
    SECTIONS.forEach(section => {
      const result = analysisResult.results[section];
      if (!result || result.error) {
        structuredData.sections[section] = { error: result?.error || 'No data' };
        return;
      }
      
      const compliantItems = result.compliantItems || [];
      const nonCompliantItems = result.nonCompliantItems || [];
      const notApplicableItems = result.notApplicableItems || [];
      
      structuredData.summary.totalCompliant += compliantItems.length;
      structuredData.summary.totalNonCompliant += nonCompliantItems.length;
      structuredData.summary.totalNotApplicable += notApplicableItems.length;
      
      structuredData.sections[section] = {
        compliant: compliantItems.map(item => ({
          element: item.element,
          requirement: item.requirement,
          evidence: item.evidence,
          reasoning: item.reasoning,
          status: 'COMPLIANT'
        })),
        nonCompliant: nonCompliantItems.map(item => ({
          element: item.element,
          requirement: item.requirement,
          evidence: item.evidence,
          reasoning: item.reasoning,
          status: 'NON-COMPLIANT'
        })),
        notApplicable: notApplicableItems.map(item => ({
          element: item.element,
          requirement: item.requirement,
          evidence: item.evidence,
          reasoning: item.reasoning,
          status: 'NOT_APPLICABLE'
        }))
      };
    });
    
    // Calculate compliance rate
    const total = structuredData.summary.totalCompliant + 
                  structuredData.summary.totalNonCompliant + 
                  structuredData.summary.totalNotApplicable;
    
    if (total > 0) {
      structuredData.summary.complianceRate = 
        ((structuredData.summary.totalCompliant / total) * 100).toFixed(1);
    }
    
    await fs.promises.writeFile(
      outputPath, 
      JSON.stringify(structuredData, null, 2), 
      'utf8'
    );
    
    logger.success(`JSON data saved: ${outputPath}`);
    
  } catch (error) {
    logger.error(`Failed to save JSON: ${error.message}`);
    throw error;
  }
}

// Main batch processing function
async function processBatch() {
  console.log('\n========================================');
  console.log('HRSA Pre-Funding Review - Batch Processor');
  console.log('========================================\n');
  
  try {
    // Get input folder
    const inputFolder = await question('Enter the folder path containing PDF applications: ');
    
    if (!fs.existsSync(inputFolder)) {
      console.error('Error: Folder does not exist!');
      rl.close();
      return;
    }
    
    // Create output folder
    const outputFolder = path.join(inputFolder, 'Analysis_Results');
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    
    // Initialize logger
    const logPath = path.join(outputFolder, `processing_log_${Date.now()}.txt`);
    const logger = new Logger(logPath);
    
    logger.log('='.repeat(50));
    logger.log('Batch Processing Started');
    logger.log('='.repeat(50));
    logger.log(`Input Folder: ${inputFolder}`);
    logger.log(`Output Folder: ${outputFolder}`);
    
    // Load manual rules
    logger.log('Loading guiding principles document rules...');
    const manualRules = await loadManualRules();
    
    if (!manualRules) {
      logger.error('Failed to load compliance rules. Please upload guiding principles document first.');
      rl.close();
      return;
    }
    
    logger.success(`Loaded ${manualRules.length} chapters from guiding principles document`);
    
    // Get all PDF files
    const files = fs.readdirSync(inputFolder)
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .map(file => path.join(inputFolder, file));
    
    if (files.length === 0) {
      logger.warning('No PDF files found in the specified folder.');
      rl.close();
      return;
    }
    
    logger.log(`Found ${files.length} PDF files to process`);
    
    // Apply MAX_APPLICATIONS limit if set
    const filesToProcess = CONFIG.MAX_APPLICATIONS && CONFIG.MAX_APPLICATIONS > 0 
      ? files.slice(0, CONFIG.MAX_APPLICATIONS) 
      : files;
    
    if (CONFIG.MAX_APPLICATIONS && CONFIG.MAX_APPLICATIONS > 0) {
      logger.warning(`⚠️  MAX_APPLICATIONS limit set to ${CONFIG.MAX_APPLICATIONS}`);
      logger.log(`Processing only first ${filesToProcess.length} application(s) for testing/comparison`);
    }
    
    // Check for already processed files (resume capability)
    const existingOutputFiles = fs.existsSync(outputFolder) 
      ? fs.readdirSync(outputFolder).filter(f => f.endsWith('.json') && !f.includes('batch_summary'))
      : [];
    
    const processedAppNumbers = new Set();
    existingOutputFiles.forEach(file => {
      // Extract app number from filename (format: appNumber_timestamp.json)
      const match = file.match(/^(\d+)_\d+\.json$/);
      if (match) {
        processedAppNumbers.add(match[1]);
      }
    });
    
    // Filter out already processed files
    const filesToProcessFiltered = filesToProcess.filter(pdfPath => {
      const filename = path.basename(pdfPath);
      // Try to extract app number from PDF filename
      const appMatch = filename.match(/(\d{6})/);
      if (appMatch && processedAppNumbers.has(appMatch[1])) {
        logger.log(`⏭️  Skipping already processed: ${filename} (App ${appMatch[1]})`);
        return false;
      }
      return true;
    });
    
    const skippedCount = filesToProcess.length - filesToProcessFiltered.length;
    if (skippedCount > 0) {
      logger.success(`✓ Found ${skippedCount} already processed application(s) - will resume from where left off`);
    }
    
    if (filesToProcessFiltered.length === 0) {
      logger.success('All applications have already been processed!');
      rl.close();
      return;
    }
    
    // Confirm processing
    const confirm = await question(`\nProcess ${filesToProcessFiltered.length} applications (${skippedCount} already completed)? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      logger.log('Processing cancelled by user');
      rl.close();
      return;
    }
    
    // Process each file
    const results = [];
    const errors = [];
    
    for (let i = 0; i < filesToProcessFiltered.length; i++) {
      const pdfPath = filesToProcessFiltered[i];
      const filename = path.basename(pdfPath);
      
      logger.log('');
      logger.log('='.repeat(50));
      logger.log(`Processing ${i + 1}/${filesToProcessFiltered.length}: ${filename}`);
      logger.log('='.repeat(50));
      
      try {
        // Analyze application
        const analysisResult = await analyzeApplication(pdfPath, manualRules, logger);
        
        // Generate output filenames
        const appNumber = analysisResult.applicationNumber || `app_${i + 1}`;
        const baseFilename = `${appNumber}_${Date.now()}`;
        
        // Save Word document
        const wordPath = path.join(outputFolder, `${baseFilename}.docx`);
        await generateWordDocument(analysisResult, wordPath, logger);
        
        // Save JSON data
        const jsonPath = path.join(outputFolder, `${baseFilename}.json`);
        await saveStructuredJSON(analysisResult, jsonPath, logger);
        
        results.push({
          filename,
          applicationNumber: appNumber,
          status: 'SUCCESS',
          wordDocument: wordPath,
          jsonData: jsonPath
        });
        
        logger.success(`✓ Completed: ${filename}`);
        
        // Delay between applications
        if (i < filesToProcessFiltered.length - 1) {
          logger.log(`Waiting ${CONFIG.DELAY_BETWEEN_APPLICATIONS / 1000}s before next application...`);
          await sleep(CONFIG.DELAY_BETWEEN_APPLICATIONS);
        }
        
      } catch (error) {
        logger.error(`✗ Failed: ${filename} - ${error.message}`);
        errors.push({
          filename,
          error: error.message
        });
      }
    }
    
    // Summary
    logger.log('');
    logger.log('='.repeat(50));
    logger.log('Batch Processing Complete');
    logger.log('='.repeat(50));
    logger.log(`Total in Batch: ${filesToProcessFiltered.length}`);
    logger.log(`Skipped (Already Processed): ${skippedCount}`);
    logger.log(`Successful: ${results.length}`);
    logger.log(`Failed: ${errors.length}`);
    
    if (errors.length > 0) {
      logger.log('');
      logger.log('Failed Applications:');
      errors.forEach(err => {
        logger.error(`  - ${err.filename}: ${err.error}`);
      });
    }
    
    // Save summary JSON
    const summaryPath = path.join(outputFolder, `batch_summary_${Date.now()}.json`);
    await fs.promises.writeFile(
      summaryPath,
      JSON.stringify({ results, errors, timestamp: new Date().toISOString() }, null, 2),
      'utf8'
    );
    
    logger.success(`Summary saved: ${summaryPath}`);
    
    // Save log
    await logger.saveLog();
    
    console.log('\n✅ Batch processing completed!');
    console.log(`📁 Results saved to: ${outputFolder}`);
    console.log(`📋 Log file: ${logPath}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the batch processor
processBatch().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { processBatch, analyzeApplication, generateWordDocument, saveStructuredJSON };
