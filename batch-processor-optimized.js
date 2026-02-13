#!/usr/bin/env node

/**
 * HRSA Pre-Funding Review - OPTIMIZED Batch Processing Utility
 * 
 * This version validates ALL sections in ONE API call (like the UI)
 * instead of processing sections sequentially.
 * 
 * Usage: node batch-processor-optimized.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx';
import readline from 'readline';
import dotenv from 'dotenv';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.batch
dotenv.config({ path: path.join(__dirname, '.env.batch') });

// Configuration
const CONFIG = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3001',
  AZURE_DOC_ENDPOINT: process.env.AZURE_DOC_ENDPOINT || '',
  AZURE_DOC_KEY: process.env.AZURE_DOC_KEY || '',
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || '',
  AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_KEY || '',
  AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4',

  // Rate limiting settings
  DELAY_BETWEEN_APPLICATIONS: 5000, // 5 seconds between applications
  MAX_RETRIES: 3,
  RETRY_DELAY: 10000, // 10 seconds retry delay
  
  MAX_APPLICATIONS: null, // Set to 1 for testing, null or 0 to process all applications
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

// Text compression utility
function compressApplicationText(fullText) {
  let compressed = fullText;
  
  compressed = compressed.replace(/={10,}/g, '');
  compressed = compressed.replace(/PAGE \d+/gi, '');
  compressed = compressed.replace(/Page Number:\s*\d+/gi, '');
  compressed = compressed.replace(/Tracking Number[^\n]*/gi, '');
  compressed = compressed.replace(/\n{3,}/g, '\n\n');
  compressed = compressed.replace(/[ \t]{2,}/g, ' ');
  compressed = compressed.replace(/^\s+$/gm, '');
  compressed = compressed.replace(/Page \d+ of \d+/gi, '');
  compressed = compressed.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '');
  compressed = compressed.replace(/[│┤├┼─┌┐└┘]/g, ' ');
  compressed = compressed.replace(/\[TEXT\]\s*/g, '');
  compressed = compressed.replace(/\[TABLE[^\]]*\]:\s*/g, 'TABLE: ');
  compressed = compressed.replace(/_{5,}/g, '');
  compressed = compressed.replace(/-{5,}/g, '');
  compressed = compressed.replace(/\.{5,}/g, '');
  compressed = compressed.replace(/  +/g, ' ');
  compressed = compressed.replace(/\n /g, '\n');
  compressed = compressed.split('\n').filter(line => line.trim().length > 0).join('\n');
  
  return compressed.trim();
}

// Logger class
class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] [INFO] ${this.prefix}${message}`);
  }

  success(message) {
    console.log(`[${new Date().toISOString()}] [SUCCESS] ${this.prefix}${message}`);
  }

  warning(message) {
    console.warn(`[${new Date().toISOString()}] [WARNING] ${this.prefix}${message}`);
  }

  error(message) {
    console.error(`[${new Date().toISOString()}] [ERROR] ${this.prefix}${message}`);
  }
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extract application number from filename
function extractApplicationNumber(filename) {
  const match = filename.match(/(\d{6})/);
  return match ? match[1] : null;
}

// Extract HRSA announcement year from application content (e.g., HRSA-26-004 -> "26")
function extractAnnouncementYear(content) {
  const match = content.match(/HRSA[-\s](\d{2})[-\s]\d{3}/i);
  return match ? match[1] : null;
}

// Scan data directory for available rule years (folders like data/21, data/26, etc.)
function scanAvailableRuleYears(logger) {
  const dataDir = path.join(__dirname, 'data');
  const years = {};

  if (!fs.existsSync(dataDir)) {
    logger.warning('Data directory not found');
    return years;
  }

  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && /^\d{2}$/.test(entry.name)) {
      const rulesFile = path.join(dataDir, entry.name, 'compliance-rules.json');
      if (fs.existsSync(rulesFile)) {
        try {
          const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf-8'));
          years[entry.name] = {
            year: entry.name,
            fullYear: `20${entry.name}`,
            chaptersCount: rules.length,
            rulesPath: rulesFile,
            rules: rules
          };
          logger.log(`  📂 Found rules for 20${entry.name}: ${rules.length} chapters`);
        } catch (err) {
          logger.warning(`  ⚠️ Could not parse rules in data/${entry.name}/: ${err.message}`);
        }
      }
    }
  }

  return years;
}

// Load rules for a specific year, with fallback to default
function loadRulesForYear(yearCode, availableYears, defaultRules, logger) {
  if (yearCode && availableYears[yearCode]) {
    const yearData = availableYears[yearCode];
    logger.success(`📋 Using 20${yearCode} rules (${yearData.chaptersCount} chapters) from data/${yearCode}/`);
    return { rules: yearData.rules, yearLabel: `20${yearCode}` };
  }

  if (yearCode) {
    logger.warning(`⚠️ No rules found for year 20${yearCode}, falling back to default rules`);
  }

  return { rules: defaultRules, yearLabel: 'default' };
}

// Extract text from PDF using Azure Document Intelligence
async function extractTextFromPDF(pdfBuffer, filename, logger) {
  try {
    const docEndpoint = `${CONFIG.AZURE_DOC_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
    logger.log(`📡 Azure Document Intelligence Endpoint: ${docEndpoint}`);
    
    const analyzeResponse = await axios.post(
      docEndpoint,
      pdfBuffer,
      {
        headers: {
          'Content-Type': 'application/pdf',
          'Ocp-Apim-Subscription-Key': CONFIG.AZURE_DOC_KEY
        },
        maxBodyLength: Infinity
      }
    );
    
    const operationLocation = analyzeResponse.headers['operation-location'];
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }
    
    let result = null;
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      await sleep(2000);
      
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

// Validate ALL sections in ONE API call (like the UI)
async function validateAllSections(applicationText, manualRules, logger) {
  try {
    logger.log(`🚀 Processing ALL ${SECTIONS.length} sections in ONE API call...`);
    
    // Build comprehensive prompt with ALL sections
    const allSectionsPrompt = manualRules.map((chapter, chapterIndex) => {
      const elementsPrompt = chapter.elements.map((element, elementIndex) => `
REQUIREMENT ${chapterIndex + 1}.${elementIndex + 1}:
- Element: ${element.element || 'Compliance Requirement'}
- Requirement: ${element.requirementText}
${element.requirementDetails && element.requirementDetails.length > 0 ? `- Must Address: ${element.requirementDetails.join('; ')}` : ''}
${element.applicationSection ? `- Review Section: ${element.applicationSection}` : ''}
${element.applicationItems && element.applicationItems.length > 0 ? `- Check Items: ${element.applicationItems.join('; ')}` : ''}
${element.footnotes ? `- Notes: ${element.footnotes}` : ''}
`).join('\n');

      return `
═══════════════════════════════════════════════════════════════
CHAPTER ${chapterIndex + 1}: ${chapter.chapter || chapter.section}
AUTHORITY: ${chapter.authority || 'N/A'}
═══════════════════════════════════════════════════════════════

${elementsPrompt}
`;
    }).join('\n');

    // Count total requirements
    const totalRequirements = manualRules.reduce((sum, chapter) => sum + chapter.elements.length, 0);

    const openaiEndpoint = `${CONFIG.AZURE_OPENAI_ENDPOINT}/openai/deployments/${CONFIG.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;
    logger.log(`📡 Azure OpenAI Endpoint: ${openaiEndpoint}`);
    logger.log(`🤖 Using Deployment: ${CONFIG.AZURE_OPENAI_DEPLOYMENT}`);
    
    const prompt = `You are validating HRSA compliance requirements for a health center application.

You must validate ${totalRequirements} requirements across ${SECTIONS.length} chapters below.

${allSectionsPrompt}

═══════════════════════════════════════════════════════════════
VALIDATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL - NO HALLUCINATION:
- ONLY use information EXPLICITLY written in the application
- NEVER make up, assume, infer, or guess information
- If you cannot find explicit evidence, mark as NON_COMPLIANT

VALIDATION STEPS:
1. For EACH requirement, search the ENTIRE application systematically
2. Check for N/A conditions FIRST (only if explicit NOTE says "Select 'N/A' if...")
3. Find direct quotes that prove compliance
4. Validate ALL "Must Address" items if listed
5. Document findings concisely

STATUS RULES:
- COMPLIANT: Clear, explicit proof found that fully satisfies requirement
- NON_COMPLIANT: No evidence found, or evidence is incomplete/unclear
- NOT_APPLICABLE: Only if explicit NOTE says "N/A if..." AND condition is met

EVIDENCE REQUIREMENTS:
- Quote 1-3 KEY sentences maximum in "quotation marks"
- Include exact page numbers or section references
- Be specific about location (e.g., "Page 15, Budget Narrative section")

═══════════════════════════════════════════════════════════════
APPLICATION CONTENT TO VALIDATE
═══════════════════════════════════════════════════════════════

${applicationText}

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT (JSON)
═══════════════════════════════════════════════════════════════

Return a JSON object with results for ALL ${SECTIONS.length} sections:

{
  "Needs Assessment": {
    "validations": [
      {
        "element": "requirement name",
        "status": "COMPLIANT|NON_COMPLIANT|NOT_APPLICABLE",
        "whatWasChecked": "what you looked for",
        "evidence": "direct quote from application",
        "evidenceLocation": "Page X, Section Y",
        "evidenceSection": "section name where found",
        "reasoning": "brief explanation"
      }
    ]
  },
  "Sliding Fee Discount Program": { "validations": [...] },
  ... (all ${SECTIONS.length} sections)
}

CRITICAL: Return exactly ${totalRequirements} validation objects across all sections.`;

    const response = await axios.post(
      openaiEndpoint,
      {
        messages: [
          { role: 'system', content: 'You are a compliance analyst for HRSA health center applications. You validate all requirements comprehensively in one analysis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 16000 // Increased for all sections
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': CONFIG.AZURE_OPENAI_KEY
        }
      }
    );
    
    let content = response.data.choices[0].message.content;
    
    // Remove markdown code blocks if present
    if (content.includes('```json')) {
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    } else if (content.includes('```')) {
      content = content.replace(/```\s*/g, '');
    }
    
    const allResults = JSON.parse(content.trim());
    
    // Process results for each section
    const results = {};
    let totalValidations = 0;
    let totalCompliant = 0;
    let totalNonCompliant = 0;
    let totalNA = 0;
    
    SECTIONS.forEach(section => {
      const sectionResult = allResults[section];
      if (!sectionResult || !sectionResult.validations) {
        logger.warning(`No results found for section: ${section}`);
        results[section] = { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] };
        return;
      }
      
      const compliantItems = [];
      const nonCompliantItems = [];
      const notApplicableItems = [];
      
      sectionResult.validations.forEach(validation => {
        const item = {
          element: validation.element || 'Unknown',
          requirement: validation.requirement || 'Unknown',
          status: validation.status,
          whatWasChecked: validation.whatWasChecked || 'Not specified',
          evidence: validation.evidence || 'Not found',
          evidenceLocation: validation.evidenceLocation || 'Not found',
          evidenceSection: validation.evidenceSection || 'Not found',
          reasoning: validation.reasoning || 'No reasoning provided'
        };
        
        if (validation.status === 'COMPLIANT') {
          compliantItems.push(item);
          totalCompliant++;
        } else if (validation.status === 'NOT_APPLICABLE') {
          notApplicableItems.push(item);
          totalNA++;
        } else {
          nonCompliantItems.push(item);
          totalNonCompliant++;
        }
        totalValidations++;
      });
      
      results[section] = { compliantItems, nonCompliantItems, notApplicableItems };
      logger.log(`  ✓ ${section}: ${compliantItems.length} compliant, ${nonCompliantItems.length} non-compliant, ${notApplicableItems.length} N/A`);
    });
    
    logger.success(`✅ Processed ${totalValidations} validations: ${totalCompliant} compliant, ${totalNonCompliant} non-compliant, ${totalNA} N/A`);
    
    return results;
  } catch (error) {
    logger.error(`Azure OpenAI error: ${error.message}`);
    throw error;
  }
}

// Analyze single application
async function analyzeApplication(pdfPath, defaultRules, availableYears, logger) {
  const filename = path.basename(pdfPath);
  const applicationNumber = extractApplicationNumber(filename);
  
  logger.log(`Analyzing: ${filename} (App #: ${applicationNumber || 'Unknown'})`);
  
  const startTime = Date.now();
  
  try {
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    
    logger.log(`Extracting text from PDF...`);
    const extractionStartTime = Date.now();
    const extractedText = await extractTextFromPDF(pdfBuffer, filename, logger);
    const extractionTime = ((Date.now() - extractionStartTime) / 1000).toFixed(1);
    logger.log(`Extracted ${extractedText.length} characters from PDF (took ${extractionTime}s)`);
    
    // Save extracted text to file for review
    const outputFolder = path.dirname(pdfPath);
    const extractedTextDir = path.join(outputFolder, 'Analysis_Results', 'extracted-text');
    if (!fs.existsSync(extractedTextDir)) {
      fs.mkdirSync(extractedTextDir, { recursive: true });
    }
    const textFilename = filename.replace('.pdf', '_extracted.txt');
    await fs.promises.writeFile(path.join(extractedTextDir, textFilename), extractedText, 'utf-8');
    logger.log(`📝 Saved extracted text to: extracted-text/${textFilename}`);
    
    // Extract announcement year from application content
    const announcementYear = extractAnnouncementYear(extractedText);
    let ruleYearLabel = 'default';
    let rulesToUse = defaultRules;
    
    if (announcementYear) {
      logger.log(`🔍 Detected Funding Opportunity: HRSA-${announcementYear}-XXX`);
      const yearResult = loadRulesForYear(announcementYear, availableYears, defaultRules, logger);
      rulesToUse = yearResult.rules;
      ruleYearLabel = yearResult.yearLabel;
    } else {
      logger.warning(`ℹ️ No HRSA announcement number detected — using default rules`);
    }
    
    logger.log(`📋 Validating against ${ruleYearLabel} compliance rules (${rulesToUse.length} chapters)`);
    
    const compressedText = compressApplicationText(extractedText);
    const compressionRatio = ((1 - compressedText.length / extractedText.length) * 100).toFixed(1);
    logger.log(`Compressed text: ${extractedText.length} → ${compressedText.length} chars (${compressionRatio}% reduction)`);
    
    const estimatedTokens = Math.ceil(compressedText.length / 4);
    logger.log(`Estimated tokens: ~${estimatedTokens}`);
    
    // Validate ALL sections in ONE API call
    const analysisStartTime = Date.now();
    const results = await validateAllSections(compressedText, rulesToUse, logger);
    const analysisTime = ((Date.now() - analysisStartTime) / 1000).toFixed(1);
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.log(`⏱️  Analysis completed in ${analysisTime}s (Total: ${totalTime}s)`);
    
    return {
      applicationNumber,
      filename,
      timestamp: new Date().toISOString(),
      ruleYear: ruleYearLabel,
      announcementYear: announcementYear || null,
      results
    };
    
  } catch (error) {
    logger.error(`Failed to analyze ${filename}: ${error.message}`);
    throw error;
  }
}

// Generate Word document (same as original)
async function generateWordDocument(analysisResult, outputPath, logger) {
  try {
    const sections = [];
    
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
        spacing: { after: 200 }
      })
    );
    
    if (analysisResult.ruleYear) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Validated Against: `, bold: true }),
            new TextRun({ text: `${analysisResult.ruleYear} Compliance Rules` }),
            ...(analysisResult.announcementYear ? [
              new TextRun({ text: `  |  Announcement: HRSA-${analysisResult.announcementYear}-XXX`, italics: true })
            ] : [])
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      );
    }
    
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
        spacing: { after: 200 }
      })
    );
    
    // Add detailed results for each section
    SECTIONS.forEach(section => {
      const result = analysisResult.results[section];
      if (!result) return;
      
      sections.push(
        new Paragraph({
          text: section,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
      
      if (result.error) {
        sections.push(
          new Paragraph({
            text: `Error: ${result.error}`,
            spacing: { after: 200 }
          })
        );
        return;
      }
      
      // Compliant items
      if (result.compliantItems && result.compliantItems.length > 0) {
        sections.push(
          new Paragraph({
            text: '✅ Compliant Items',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
          })
        );
        
        result.compliantItems.forEach((item, index) => {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${index + 1}. ${item.element}`, bold: true })
              ],
              spacing: { before: 100, after: 50 }
            })
          );
          
          sections.push(
            new Paragraph({
              text: `Evidence: ${item.evidence}`,
              spacing: { after: 50 }
            })
          );
          
          sections.push(
            new Paragraph({
              text: `Location: ${item.evidenceLocation}`,
              spacing: { after: 100 }
            })
          );
        });
      }
      
      // Non-compliant items
      if (result.nonCompliantItems && result.nonCompliantItems.length > 0) {
        sections.push(
          new Paragraph({
            text: '❌ Non-Compliant Items',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
          })
        );
        
        result.nonCompliantItems.forEach((item, index) => {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${index + 1}. ${item.element}`, bold: true })
              ],
              spacing: { before: 100, after: 50 }
            })
          );
          
          sections.push(
            new Paragraph({
              text: `Reasoning: ${item.reasoning}`,
              spacing: { after: 100 }
            })
          );
        });
      }
      
      // Not applicable items
      if (result.notApplicableItems && result.notApplicableItems.length > 0) {
        sections.push(
          new Paragraph({
            text: '⊘ Not Applicable Items',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
          })
        );
        
        result.notApplicableItems.forEach((item, index) => {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${index + 1}. ${item.element}`, bold: true })
              ],
              spacing: { before: 100, after: 50 }
            })
          );
          
          sections.push(
            new Paragraph({
              text: `Reasoning: ${item.reasoning}`,
              spacing: { after: 100 }
            })
          );
        });
      }
    });
    
    const doc = new Document({ sections: [{ properties: {}, children: sections }] });
    const buffer = await Packer.toBuffer(doc);
    await fs.promises.writeFile(outputPath, buffer);
    
    logger.success(`Generated Word document: ${path.basename(outputPath)}`);
  } catch (error) {
    logger.error(`Failed to generate Word document: ${error.message}`);
    throw error;
  }
}

// Main execution
async function main() {
  const logger = new Logger();
  
  console.log('\n========================================');
  console.log('HRSA Pre-Funding Review - OPTIMIZED Batch Processor');
  console.log('(Validates ALL sections in ONE API call)');
  console.log('========================================\n');
  
  // Log Azure configuration
  logger.log('🔧 Azure Configuration:');
  logger.log(`  📄 Document Intelligence: ${CONFIG.AZURE_DOC_ENDPOINT || '❌ NOT SET'}`);
  logger.log(`  🤖 OpenAI Endpoint: ${CONFIG.AZURE_OPENAI_ENDPOINT || '❌ NOT SET'}`);
  logger.log(`  🚀 OpenAI Deployment: ${CONFIG.AZURE_OPENAI_DEPLOYMENT}`);
  logger.log(`  🌐 Backend URL: ${CONFIG.BACKEND_URL}`);
  logger.log('');
  
  const inputFolder = await question('Enter the folder path containing PDF applications: ');
  
  if (!fs.existsSync(inputFolder)) {
    logger.error(`Folder not found: ${inputFolder}`);
    rl.close();
    return;
  }
  
  const outputFolder = path.join(inputFolder, 'Analysis_Results');
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }
  
  logger.log('==================================================');
  logger.log('Batch Processing Started');
  logger.log('==================================================');
  logger.log(`Input Folder: ${inputFolder}`);
  logger.log(`Output Folder: ${outputFolder}`);
  
  // Scan for year-specific rule sets
  logger.log('📂 Scanning for year-specific rule sets...');
  const availableYears = scanAvailableRuleYears(logger);
  const yearKeys = Object.keys(availableYears);
  
  if (yearKeys.length > 0) {
    logger.success(`Found ${yearKeys.length} year-specific rule set(s): ${yearKeys.map(y => `20${y}`).join(', ')}`);
    logger.log('  Rules will be auto-selected based on HRSA-XX-XXX announcement number in each application');
  } else {
    logger.warning('No year-specific rule sets found in data/{YY}/ folders');
  }
  
  // Load default compliance rules as fallback
  logger.log('Loading default guiding principles document rules...');
  const rulesPath = path.join(__dirname, 'data', 'compliance-rules.json');
  let defaultRules = [];
  try {
    defaultRules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    logger.success(`Loaded ${defaultRules.length} chapters from default rules (fallback)`);
  } catch (err) {
    if (yearKeys.length === 0) {
      logger.error('No default rules found and no year-specific rules available. Cannot proceed.');
      rl.close();
      return;
    }
    logger.warning('No default compliance-rules.json found, will rely on year-specific rules only');
  }
  
  // Find all PDF files
  const allFiles = fs.readdirSync(inputFolder);
  const pdfFiles = allFiles.filter(f => f.toLowerCase().endsWith('.pdf'));
  
  // Check for already completed applications
  const completedFiles = fs.readdirSync(outputFolder)
    .filter(f => f.endsWith('.docx'))
    .map(f => f.replace('.docx', '.pdf'));
  
  const pendingFiles = pdfFiles.filter(f => !completedFiles.includes(f));
  
  logger.log(`Found ${pdfFiles.length} PDF files to process`);
  
  if (pendingFiles.length === 0) {
    logger.success('All applications have been processed!');
    rl.close();
    return;
  }
  
  const filesToProcess = CONFIG.MAX_APPLICATIONS && CONFIG.MAX_APPLICATIONS > 0
    ? pendingFiles.slice(0, CONFIG.MAX_APPLICATIONS)
    : pendingFiles;
  
  const proceed = await question(`\nProcess ${filesToProcess.length} applications (${completedFiles.length} already completed)? (yes/no): `);
  
  if (proceed.toLowerCase() !== 'yes') {
    logger.log('Processing cancelled by user');
    rl.close();
    return;
  }
  
  // Process each application
  const batchResults = [];
  
  for (let i = 0; i < filesToProcess.length; i++) {
    const filename = filesToProcess[i];
    const pdfPath = path.join(inputFolder, filename);
    
    logger.log('');
    logger.log('==================================================');
    logger.log(`Processing ${i + 1}/${filesToProcess.length}: ${filename}`);
    logger.log('==================================================');
    
    try {
      const result = await analyzeApplication(pdfPath, defaultRules, availableYears, logger);
      batchResults.push(result);
      
      // Generate Word document
      const docxFilename = filename.replace('.pdf', '.docx');
      const docxPath = path.join(outputFolder, docxFilename);
      await generateWordDocument(result, docxPath, logger);
      
      // Save JSON result
      const jsonFilename = filename.replace('.pdf', '.json');
      const jsonPath = path.join(outputFolder, jsonFilename);
      await fs.promises.writeFile(jsonPath, JSON.stringify(result, null, 2));
      logger.success(`Saved JSON result: ${jsonFilename}`);
      
      // Wait between applications
      if (i < filesToProcess.length - 1) {
        logger.log(`Waiting ${CONFIG.DELAY_BETWEEN_APPLICATIONS / 1000}s before next application...`);
        await sleep(CONFIG.DELAY_BETWEEN_APPLICATIONS);
      }
      
    } catch (error) {
      logger.error(`Failed to process ${filename}: ${error.message}`);
      batchResults.push({
        filename,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Save batch summary
  const summaryPath = path.join(outputFolder, `batch_summary_${Date.now()}.json`);
  await fs.promises.writeFile(summaryPath, JSON.stringify({
    processedAt: new Date().toISOString(),
    totalProcessed: filesToProcess.length,
    results: batchResults
  }, null, 2));
  
  logger.log('');
  logger.log('==================================================');
  logger.success(`Batch processing completed! Processed ${filesToProcess.length} applications`);
  logger.log('==================================================');
  
  rl.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
