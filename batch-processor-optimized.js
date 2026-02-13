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
import crypto from 'crypto';
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
    
    // Step 1: Extract footer page numbers from each page (matching UI logic)
    const footerPageMap = {};
    
    pages.forEach((page, index) => {
      const azurePageNum = page.pageNumber || (index + 1);
      const lines = page.lines || [];
      
      lines.forEach(line => {
        const pageMatch = line.content.match(/Page Number:\s*(\d+)/i);
        if (pageMatch) {
          footerPageMap[azurePageNum] = pageMatch[1];
        }
      });
      
      if (!footerPageMap[azurePageNum]) {
        footerPageMap[azurePageNum] = azurePageNum.toString();
      }
    });
    
    if (paragraphs.length > 0) {
      const pageContent = {};
      
      paragraphs.forEach(para => {
        const azurePageNum = para.boundingRegions?.[0]?.pageNumber || 1;
        const footerPageNum = footerPageMap[azurePageNum] || azurePageNum;
        
        if (!pageContent[footerPageNum]) pageContent[footerPageNum] = [];
        
        // Skip footer lines themselves
        if (para.content.match(/Page Number:\s*\d+/i) || para.content.match(/Tracking Number/i)) {
          return;
        }
        
        let contentType = '[TEXT]';
        if (para.role === 'title' || para.role === 'sectionHeading') {
          contentType = '[HEADING]';
        }
        
        pageContent[footerPageNum].push({
          type: contentType,
          content: para.content
        });
      });
      
      tables.forEach((table, tableIndex) => {
        const azurePageNum = table.boundingRegions?.[0]?.pageNumber || 1;
        const footerPageNum = footerPageMap[azurePageNum] || azurePageNum;
        
        if (!pageContent[footerPageNum]) pageContent[footerPageNum] = [];
        
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
        
        pageContent[footerPageNum].push({
          type: '[TABLE]',
          content: tableText
        });
      });
      
      const sortedPages = Object.keys(pageContent).sort((a, b) => parseInt(a) - parseInt(b));
      sortedPages.forEach(pageNum => {
        contentWithPages += `\n\n========== PAGE ${pageNum} (from PDF footer) ==========\n\n`;
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

// Validate ALL sections in ONE API call (matching UI logic exactly)
async function validateAllSections(applicationText, manualRules, logger) {
  try {
    logger.log(`🚀 Processing ALL ${SECTIONS.length} sections in ONE API call...`);
    
    // Build prompt with ALL chapters and ALL elements (matching UI format)
    const allChaptersPrompt = [];
    
    for (let sectionIndex = 0; sectionIndex < SECTIONS.length; sectionIndex++) {
      const section = SECTIONS[sectionIndex];
      
      const chapter = manualRules.find(r => {
        if (r.section === section) return true;
        if (section.includes(r.section) || r.section.includes(section)) return true;
        return false;
      });
      
      if (!chapter || !chapter.elements) {
        allChaptersPrompt.push(`\n[SECTION ${sectionIndex + 1}: ${section} - NO RULES FOUND]\n`);
        continue;
      }

      const elementsPrompt = chapter.elements.map((element, elemIndex) => `
REQUIREMENT #${sectionIndex + 1}.${elemIndex + 1}
SECTION: ${section}
ELEMENT: ${element.element || 'Compliance Requirement'}
REQUIREMENT: ${element.requirementText}
${element.requirementDetails && element.requirementDetails.length > 0 ? `MUST ADDRESS: ${element.requirementDetails.join('; ')}` : ''}
${element.footnotes ? `NOTES: ${element.footnotes}` : ''}
`).join('\n');

      allChaptersPrompt.push(`
═══════════════════════════════════════════════════════════════
SECTION ${sectionIndex + 1}: ${section}
═══════════════════════════════════════════════════════════════
CHAPTER: ${chapter.chapter || chapter.section}
AUTHORITY: ${chapter.authority || 'N/A'}
ELEMENTS TO VALIDATE: ${chapter.elements.length}

${elementsPrompt}
`);
    }
    
    const allChaptersPromptText = allChaptersPrompt.join('\n');

    const totalRequirements = SECTIONS.reduce((sum, section) => {
      const chapter = manualRules.find(r => r.section === section || section.includes(r.section) || r.section.includes(section));
      return sum + (chapter?.elements?.length || 0);
    }, 0);

    const openaiEndpoint = `${CONFIG.AZURE_OPENAI_ENDPOINT}/openai/deployments/${CONFIG.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;
    logger.log(`📡 Azure OpenAI Endpoint: ${openaiEndpoint}`);
    logger.log(`🤖 Using Deployment: ${CONFIG.AZURE_OPENAI_DEPLOYMENT}`);
    
    const prompt = `You are validating HRSA compliance for a health center application.

You will validate ${totalRequirements} requirements across ${SECTIONS.length} sections in ONE analysis.

${allChaptersPromptText}

═══════════════════════════════════════════════════════════════
VALIDATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL - NO HALLUCINATION:
- ONLY use information EXPLICITLY in the application
- NEVER assume, infer, or guess
- If no explicit evidence found, mark NON_COMPLIANT
- Same application = same result

VALIDATION STEPS:
1. For EACH requirement, search ENTIRE application
2. Check N/A conditions FIRST (only if NOTE says "Select 'N/A' if...")
3. Find direct quotes proving compliance
4. Validate ALL "Must Address" items
5. Document findings concisely

STATUS RULES:
- COMPLIANT: Clear explicit proof found
- NON_COMPLIANT: No evidence or incomplete
- NOT_APPLICABLE: Only if NOTE says "N/A if..." AND condition met

EVIDENCE:
- Quote 1-3 KEY sentences in "quotation marks"
- Include page numbers
- 3-4 sentence reasoning

APPLICATION CONTENT:
${applicationText}

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════

Return JSON with validations array containing ${totalRequirements} results:

{
  "validations": [
    {
      "section": "Section name",
      "requirementNumber": "1.1",
      "element": "Element name",
      "status": "COMPLIANT|NON_COMPLIANT|NOT_APPLICABLE",
      "evidence": "Direct quotes or 'Not found'",
      "evidenceLocation": "Page X or 'Not found'",
      "evidenceSection": "REQUIRED: Specific document/attachment/section name where evidence was found (e.g., 'Attachment D: Sliding Fee Schedule', 'Project Narrative - Section 3', 'Form 5A'). Use 'Not found' only if no evidence exists.",
      "reasoning": "3-4 sentences"
    }
    // ... ${totalRequirements} total validations
  ]
}

CRITICAL: Return exactly ${totalRequirements} validation objects.`;

    const response = await axios.post(
      openaiEndpoint,
      {
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 16000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': CONFIG.AZURE_OPENAI_KEY
        }
      }
    );
    
    const content = response.data.choices[0].message.content;
    const result = JSON.parse(content);
    
    // Organize results by section (matching UI parsing logic)
    const sectionResults = {};
    SECTIONS.forEach(section => {
      sectionResults[section] = { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] };
    });

    let totalValidations = 0;
    let totalCompliant = 0;
    let totalNonCompliant = 0;
    let totalNA = 0;

    if (result.validations && Array.isArray(result.validations)) {
      result.validations.forEach(validation => {
        const section = validation.section || 'Unknown';
        
        if (!sectionResults[section]) {
          sectionResults[section] = { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] };
        }

        // Find the original element to get the requirementText
        const chapter = manualRules.find(r => r.section === section || section.includes(r.section) || r.section.includes(section));
        const element = chapter?.elements?.find(e => e.element === validation.element);

        const item = {
          element: validation.element || 'Unknown',
          requirement: element?.requirementText || validation.element || 'Not specified',
          status: validation.status,
          whatWasChecked: validation.whatWasChecked || 'Not specified',
          evidence: validation.evidence || 'Not found',
          evidenceLocation: validation.evidenceLocation || 'Not found',
          evidenceSection: validation.evidenceSection || 'Not found',
          reasoning: validation.reasoning || 'No reasoning provided',
          sectionsReferenced: 'Not specified',
          contentTypes: 'Not specified'
        };

        if (validation.status === 'COMPLIANT') {
          sectionResults[section].compliantItems.push(item);
          totalCompliant++;
        } else if (validation.status === 'NOT_APPLICABLE') {
          sectionResults[section].notApplicableItems.push(item);
          totalNA++;
        } else {
          sectionResults[section].nonCompliantItems.push(item);
          totalNonCompliant++;
        }
        totalValidations++;
      });
    }

    SECTIONS.forEach(section => {
      const r = sectionResults[section];
      logger.log(`  ✓ ${section}: ${r.compliantItems.length} compliant, ${r.nonCompliantItems.length} non-compliant, ${r.notApplicableItems.length} N/A`);
    });
    
    logger.success(`✅ Processed ${totalValidations} validations: ${totalCompliant} compliant, ${totalNonCompliant} non-compliant, ${totalNA} N/A`);
    
    return sectionResults;
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
    
    const estimatedTokens = Math.ceil(extractedText.length / 4);
    logger.log(`Text length: ${extractedText.length} chars, estimated tokens: ~${estimatedTokens}`);
    
    // Validate ALL sections in ONE API call (sending full text, matching UI)
    const analysisStartTime = Date.now();
    const results = await validateAllSections(extractedText, rulesToUse, logger);
    const analysisTime = ((Date.now() - analysisStartTime) / 1000).toFixed(1);
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.log(`⏱️  Analysis completed in ${analysisTime}s (Total: ${totalTime}s)`);
    
    // Save to backend cache (matching UI cache format)
    try {
      const base64Content = pdfBuffer.toString('base64');
      const fileHash = crypto.createHash('md5').update(base64Content).digest('hex');
      const manualVersion = 'v1.0';
      
      await axios.post(`${CONFIG.BACKEND_URL}/api/cache/save`, {
        fileHash,
        manualVersion,
        data: {
          applicationName: filename,
          extractedContent: extractedText,
          results
        }
      });
      logger.success(`💾 Saved to backend cache (hash: ${fileHash.substring(0, 8)}...)`);
    } catch (cacheError) {
      logger.warning(`⚠️ Could not save to backend cache: ${cacheError.message}`);
    }
    
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
