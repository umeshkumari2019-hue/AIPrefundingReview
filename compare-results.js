import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  MANUAL_EXCEL_PATH: 'Y:\\Umesh\\OneDrive_1_1-21-2026\\ManualExcel\\SAC_PAR_Compliance_Answers_HRSA-26-004.xlsx',
  AI_RESULTS_DIR: 'Y:\\Umesh\\OneDrive_1_1-21-2026\\Analysis_Results',
  OUTPUT_DIR: 'Y:\\Umesh\\OneDrive_1_1-21-2026\\Analysis_Results\\comparisonresult',
  APPLICATION_NUMBER: '242645' // Default application number to compare
};

// Element mapping between AI system and manual Excel question format
const ELEMENT_MAPPING = {
  // 'Element b - Update of Needs Assessment': 'b. Update of Needs Assessment', // EXCLUDED FROM COMPARISON
  'Element b - Sliding Fee Discount Program Policies': 'b. Sliding Fee Discount Program Policies',
  'Element c - Sliding Fee for Column I Services': 'c. Sliding Fee for Column I Services',
  'Element e - Incorporation of Current Federal Poverty Guidelines': 'e. Incorporation of Current Federal Poverty Guidelines',
  'Element b - Documentation of Key Management Staff Positions': 'b. Documentation for Key Management Staff Positions',
  'Element d - CEO Responsibilities': 'd. CEO Responsibilities',
  'Element e - HRSA Approval for Contracting Substantive Programmatic Work': 'e. HRSA Approval for Contracting Substantive Programmatic Work',
  'Element f - Required Contract Provisions': 'f. Required Contract Provisions',
  'Element g - HRSA Approval to Subaward': 'g. HRSA Approval to Subaward',
  'Element g - HRSA Approval to Subaward (Not Applicable for Look-alikes)': 'g. HRSA Approval to Subaward',
  'Element h - Subaward Agreement': 'h. Subaward Agreement',
  'Element h - Subaward Agreement (Not Applicable for Look-alikes)': 'h. Subaward Agreement',
  'Element a - Coordination and Integration of Activities': 'a. Coordination and Integration of Activities',
  'Element b - Collaboration with Other Primary Care Providers': 'b. Collaboration with Other Primary Care Providers',
  'Element c - Participation in Insurance Programs': 'c. Participation in Insurance Programs',
  'Element h - Policies or Procedures for Waiving or Reducing Fees': 'h. Policies or Procedures for Waiving or Reducing Fees',
  'Element a - Budgeting for Scope of Project': 'a. Annual Budgeting for Scope of Project',
  'Element b - Revenue Sources': 'b. Revenue Sources',
  'Element a - Maintenance of Board Authority Over Health Center Project': 'a. Maintenance of Board Authority Over Health Center Project',
  'Element b - Required Authorities and Responsibilities': 'b. Required Authorities and Responsibilities',
  'Element a - Board Member Selection and Removal Process': 'a. Board Member Selection and Removal Process',
  'Element b - Required Board Composition': 'b. Required Board Composition',
  'Element c - Current Board Composition': 'c. Current Board Composition',
  'Element e - Waiver Requests': 'e. Waiver Requests'
};

// Logger utility
const logger = {
  log: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  warning: (msg) => console.warn(`[WARNING] ${msg}`)
};

// Load manual Excel data
async function loadManualExcel(appNumber) {
  logger.log(`Loading manual Excel file: ${CONFIG.MANUAL_EXCEL_PATH}`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(CONFIG.MANUAL_EXCEL_PATH);
  const worksheet = workbook.getWorksheet('Sheet1');
  
  const manualData = {};
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const trackingNo = row.getCell(1).value;
    const question = row.getCell(2).value;
    const answer = row.getCell(3).value;
    const comment = row.getCell(4).value;
    
    // Filter by application number
    if (trackingNo && trackingNo.toString() === appNumber.toString()) {
      manualData[question] = {
        answer: answer,
        comment: comment,
        trackingNo: trackingNo
      };
    }
  });
  
  logger.success(`Loaded ${Object.keys(manualData).length} manual compliance entries for application ${appNumber}`);
  return manualData;
}

// Load AI results from JSON
function loadAIResults(appNumber) {
  // Try to find JSON file that starts with the application number
  const files = fs.readdirSync(CONFIG.AI_RESULTS_DIR);
  const jsonFile = files.find(file => 
    file.startsWith(appNumber) && file.endsWith('.json') && !file.includes('batch_summary')
  );
  
  if (!jsonFile) {
    logger.error(`AI results file not found for application ${appNumber} in ${CONFIG.AI_RESULTS_DIR}`);
    logger.log(`Available files: ${files.filter(f => f.endsWith('.json')).join(', ')}`);
    return null;
  }
  
  const jsonPath = path.join(CONFIG.AI_RESULTS_DIR, jsonFile);
  logger.log(`Loading AI results from: ${jsonPath}`);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  logger.success(`Loaded AI results for application ${appNumber}`);
  return data;
}

// Normalize compliance status
function normalizeStatus(status) {
  if (!status) return 'UNKNOWN';
  
  const statusStr = status.toString().toLowerCase().trim();
  
  if (statusStr.includes('yes') || statusStr.includes('compliant') || statusStr.includes('demonstrates compliance')) {
    return 'COMPLIANT';
  } else if (statusStr.includes('no') || statusStr.includes('non-compliant') || statusStr.includes('does not demonstrate')) {
    return 'NON-COMPLIANT';
  } else if (statusStr.includes('n/a') || statusStr.includes('not applicable')) {
    return 'NOT APPLICABLE';
  }
  
  return 'UNKNOWN';
}

// Compare AI vs Manual results
function compareResults(aiResults, manualData, appNumber) {
  logger.log('Starting comparison analysis...');
  
  const comparison = [];
  let totalElements = 0;
  let matchingElements = 0;
  let mismatchElements = 0;
  let missingInAI = 0;
  let missingInManual = 0;
  
  // Access the sections object from AI results
  const sections = aiResults.sections || aiResults;
  
  // Process each section in AI results
  Object.keys(sections).forEach(section => {
    const sectionData = sections[section];
    
    if (sectionData.error) {
      logger.warning(`Section ${section} has error: ${sectionData.error}`);
      return;
    }
    
    // Process compliant items
    if (sectionData.compliant) {
      sectionData.compliant.forEach(item => {
        const aiElement = item.element;
        
        // Skip excluded elements
        if (aiElement === 'Element b - Update of Needs Assessment') {
          return;
        }
        
        totalElements++;
        const aiStatus = 'COMPLIANT';
        const aiReasoning = item.reasoning || '';
        const aiEvidence = item.evidence || '';
        
        // Map to manual Excel question format
        const manualQuestion = ELEMENT_MAPPING[aiElement] || aiElement;
        const manualEntry = manualData[manualQuestion];
        
        if (manualEntry) {
          const manualStatus = normalizeStatus(manualEntry.answer);
          const match = aiStatus === manualStatus;
          
          if (match) {
            matchingElements++;
          } else {
            mismatchElements++;
          }
          
          comparison.push({
            applicationNumber: appNumber,
            section: section,
            element: aiElement,
            aiStatus: aiStatus,
            manualStatus: manualStatus,
            match: match ? 'MATCH' : 'MISMATCH',
            aiReasoning: aiReasoning,
            aiEvidence: aiEvidence,
            manualComment: manualEntry.comment || '',
            notes: match ? '' : `AI: ${aiStatus}, Manual: ${manualStatus}`
          });
        } else {
          missingInManual++;
          comparison.push({
            applicationNumber: appNumber,
            section: section,
            element: aiElement,
            aiStatus: aiStatus,
            manualStatus: 'NOT FOUND',
            match: 'MISSING IN MANUAL',
            aiReasoning: aiReasoning,
            aiEvidence: aiEvidence,
            manualComment: '',
            notes: 'Element not found in manual Excel'
          });
        }
      });
    }
    
    // Process non-compliant items
    if (sectionData.nonCompliant) {
      sectionData.nonCompliant.forEach(item => {
        const aiElement = item.element;
        
        // Skip excluded elements
        if (aiElement === 'Element b - Update of Needs Assessment') {
          return;
        }
        
        totalElements++;
        const aiStatus = 'NON-COMPLIANT';
        const aiReasoning = item.reasoning || '';
        const aiEvidence = item.evidence || '';
        
        const manualQuestion = ELEMENT_MAPPING[aiElement] || aiElement;
        const manualEntry = manualData[manualQuestion];
        
        if (manualEntry) {
          const manualStatus = normalizeStatus(manualEntry.answer);
          const match = aiStatus === manualStatus;
          
          if (match) {
            matchingElements++;
          } else {
            mismatchElements++;
          }
          
          comparison.push({
            applicationNumber: appNumber,
            section: section,
            element: aiElement,
            aiStatus: aiStatus,
            manualStatus: manualStatus,
            match: match ? 'MATCH' : 'MISMATCH',
            aiReasoning: aiReasoning,
            aiEvidence: aiEvidence,
            manualComment: manualEntry.comment || '',
            notes: match ? '' : `AI: ${aiStatus}, Manual: ${manualStatus}`
          });
        } else {
          missingInManual++;
          comparison.push({
            applicationNumber: appNumber,
            section: section,
            element: aiElement,
            aiStatus: aiStatus,
            manualStatus: 'NOT FOUND',
            match: 'MISSING IN MANUAL',
            aiReasoning: aiReasoning,
            aiEvidence: aiEvidence,
            manualComment: '',
            notes: 'Element not found in manual Excel'
          });
        }
      });
    }
    
    // Process not applicable items
    if (sectionData.notApplicable) {
      sectionData.notApplicable.forEach(item => {
        const aiElement = item.element;
        
        // Skip excluded elements
        if (aiElement === 'Element b - Update of Needs Assessment') {
          return;
        }
        
        totalElements++;
        const aiStatus = 'NOT APPLICABLE';
        const aiReasoning = item.reasoning || '';
        const aiEvidence = item.evidence || '';
        
        const manualQuestion = ELEMENT_MAPPING[aiElement] || aiElement;
        const manualEntry = manualData[manualQuestion];
        
        if (manualEntry) {
          const manualStatus = normalizeStatus(manualEntry.answer);
          const match = aiStatus === manualStatus;
          
          if (match) {
            matchingElements++;
          } else {
            mismatchElements++;
          }
          
          comparison.push({
            applicationNumber: appNumber,
            section: section,
            element: aiElement,
            aiStatus: aiStatus,
            manualStatus: manualStatus,
            match: match ? 'MATCH' : 'MISMATCH',
            aiReasoning: aiReasoning,
            aiEvidence: aiEvidence,
            manualComment: manualEntry.comment || '',
            notes: match ? '' : `AI: ${aiStatus}, Manual: ${manualStatus}`
          });
        } else {
          missingInManual++;
          comparison.push({
            applicationNumber: appNumber,
            section: section,
            element: aiElement,
            aiStatus: aiStatus,
            manualStatus: 'NOT FOUND',
            match: 'MISSING IN MANUAL',
            aiReasoning: aiReasoning,
            aiEvidence: aiEvidence,
            manualComment: '',
            notes: 'Element not found in manual Excel'
          });
        }
      });
    }
  });
  
  // Check for elements in manual but not in AI
  Object.keys(manualData).forEach(question => {
    const found = comparison.some(c => {
      const mappedQuestion = ELEMENT_MAPPING[c.element] || c.element;
      return mappedQuestion === question;
    });
    
    if (!found) {
      missingInAI++;
      comparison.push({
        applicationNumber: appNumber,
        section: 'UNKNOWN',
        element: question,
        aiStatus: 'NOT FOUND',
        manualStatus: normalizeStatus(manualData[question].answer),
        match: 'MISSING IN AI',
        aiReasoning: '',
        aiEvidence: '',
        manualComment: manualData[question].comment || '',
        notes: 'Element not found in AI results'
      });
    }
  });
  
  const successPercentage = totalElements > 0 ? ((matchingElements / totalElements) * 100).toFixed(2) : 0;
  
  const stats = {
    totalElements,
    matchingElements,
    mismatchElements,
    missingInAI,
    missingInManual,
    successPercentage: parseFloat(successPercentage)
  };
  
  logger.success(`Comparison complete: ${matchingElements}/${totalElements} matches (${successPercentage}% success rate)`);
  
  return { comparison, stats };
}

// Generate comparison Excel report
async function generateComparisonReport(comparison, stats, appNumber) {
  logger.log('Generating comparison Excel report...');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }
  
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Detailed Comparison
  const detailSheet = workbook.addWorksheet('Detailed Comparison');
  
  // Add headers
  detailSheet.columns = [
    { header: 'Application Number', key: 'applicationNumber', width: 20 },
    { header: 'Section', key: 'section', width: 30 },
    { header: 'Element', key: 'element', width: 50 },
    { header: 'AI Status', key: 'aiStatus', width: 20 },
    { header: 'Manual Status', key: 'manualStatus', width: 20 },
    { header: 'Match Status', key: 'match', width: 20 },
    { header: 'AI Reasoning', key: 'aiReasoning', width: 60 },
    { header: 'AI Evidence', key: 'aiEvidence', width: 60 },
    { header: 'Manual Comment', key: 'manualComment', width: 60 },
    { header: 'Notes', key: 'notes', width: 40 }
  ];
  
  // Style header row
  detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  detailSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0070C0' }
  };
  
  // Add data rows
  comparison.forEach(row => {
    const excelRow = detailSheet.addRow(row);
    
    // Color code match status
    const matchCell = excelRow.getCell('match');
    if (row.match === 'MATCH') {
      matchCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF92D050' } // Green
      };
    } else if (row.match === 'MISMATCH') {
      matchCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' } // Red
      };
    } else {
      matchCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC000' } // Orange
      };
    }
  });
  
  // Add autofilter
  detailSheet.autoFilter = {
    from: 'A1',
    to: 'J1'
  };
  
  // Sheet 2: Summary Statistics
  const summarySheet = workbook.addWorksheet('Summary');
  
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 }
  ];
  
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0070C0' }
  };
  
  summarySheet.addRow({ metric: 'Application Number', value: appNumber });
  summarySheet.addRow({ metric: 'Total Elements Compared', value: stats.totalElements });
  summarySheet.addRow({ metric: 'Matching Elements', value: stats.matchingElements });
  summarySheet.addRow({ metric: 'Mismatched Elements', value: stats.mismatchElements });
  summarySheet.addRow({ metric: 'Missing in AI Results', value: stats.missingInAI });
  summarySheet.addRow({ metric: 'Missing in Manual Excel', value: stats.missingInManual });
  summarySheet.addRow({ metric: 'Success Percentage', value: `${stats.successPercentage}%` });
  
  // Highlight success percentage
  const successRow = summarySheet.getRow(7);
  successRow.font = { bold: true, size: 14 };
  successRow.getCell('value').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: stats.successPercentage >= 80 ? 'FF92D050' : stats.successPercentage >= 60 ? 'FFFFC000' : 'FFFF0000' }
  };
  
  // Save workbook
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputPath = path.join(CONFIG.OUTPUT_DIR, `Comparison_${appNumber}_${timestamp}.xlsx`);
  
  await workbook.xlsx.writeFile(outputPath);
  logger.success(`Comparison report generated: ${outputPath}`);
  
  return outputPath;
}

// Main execution
async function main() {
  try {
    const appNumber = process.argv[2] || CONFIG.APPLICATION_NUMBER;
    
    logger.log(`Starting comparison for application: ${appNumber}`);
    logger.log('='.repeat(60));
    
    // Load manual Excel data
    const manualData = await loadManualExcel(appNumber);
    
    // Load AI results from JSON
    const aiResults = loadAIResults(appNumber);
    
    if (!aiResults) {
      logger.error('Failed to load AI results. Exiting.');
      process.exit(1);
    }
    
    // Compare results
    const { comparison, stats } = compareResults(aiResults, manualData, appNumber);
    
    // Generate report
    const reportPath = await generateComparisonReport(comparison, stats, appNumber);
    
    // Print summary
    logger.log('='.repeat(60));
    logger.log('COMPARISON SUMMARY:');
    logger.log(`Application Number: ${appNumber}`);
    logger.log(`Total Elements: ${stats.totalElements}`);
    logger.log(`Matches: ${stats.matchingElements} (${stats.successPercentage}%)`);
    logger.log(`Mismatches: ${stats.mismatchElements}`);
    logger.log(`Missing in AI: ${stats.missingInAI}`);
    logger.log(`Missing in Manual: ${stats.missingInManual}`);
    logger.log('='.repeat(60));
    logger.success(`Report saved to: ${reportPath}`);
    
  } catch (error) {
    logger.error(`Error during comparison: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
main();

export { loadManualExcel, loadAIResults, compareResults, generateComparisonReport };
