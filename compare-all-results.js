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
  OUTPUT_DIR: 'Y:\\Umesh\\OneDrive_1_1-21-2026\\Analysis_Results\\comparisonresult'
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

// Load manual Excel file
function loadManualExcel() {
  logger.log(`Loading manual Excel file: ${CONFIG.MANUAL_EXCEL_PATH}`);
  
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.readFile(CONFIG.MANUAL_EXCEL_PATH).then(() => {
    const worksheet = workbook.getWorksheet('Sheet1');
    const manualData = {};
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      const appNumber = row.getCell(1).value?.toString();
      const question = row.getCell(2).value;
      const answer = row.getCell(3).value;
      const comment = row.getCell(4).value;
      
      if (appNumber && question) {
        if (!manualData[appNumber]) {
          manualData[appNumber] = {};
        }
        manualData[appNumber][question] = {
          answer: answer,
          comment: comment
        };
      }
    });
    
    logger.success(`Loaded manual data for ${Object.keys(manualData).length} applications`);
    return manualData;
  });
}

// Find all AI result JSON files
function findAIResultFiles() {
  const files = fs.readdirSync(CONFIG.AI_RESULTS_DIR);
  const jsonFiles = files.filter(file => 
    file.endsWith('.json') && !file.includes('batch_summary')
  );
  
  logger.log(`Found ${jsonFiles.length} AI result files`);
  return jsonFiles;
}

// Load AI results from JSON file
function loadAIResults(filename) {
  const jsonPath = path.join(CONFIG.AI_RESULTS_DIR, filename);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return data;
}

// Normalize compliance status
function normalizeStatus(status) {
  if (!status) return 'UNKNOWN';
  
  const statusStr = status.toString().toUpperCase().trim();
  
  if (statusStr.includes('YES') || statusStr.includes('COMPLIANT') || statusStr === 'C') {
    return 'COMPLIANT';
  }
  if (statusStr.includes('NO') || statusStr.includes('NON-COMPLIANT') || statusStr.includes('NON COMPLIANT')) {
    return 'NON-COMPLIANT';
  }
  if (statusStr.includes('N/A') || statusStr.includes('NOT APPLICABLE')) {
    return 'NOT APPLICABLE';
  }
  
  return 'UNKNOWN';
}

// Compare AI vs Manual results for a single application
function compareApplication(aiResults, manualData, appNumber) {
  const comparison = [];
  let totalElements = 0;
  let matchingElements = 0;
  let mismatchElements = 0;
  let missingInAI = 0;
  let missingInManual = 0;
  
  const sections = aiResults.sections || aiResults;
  const appManualData = manualData[appNumber] || {};
  
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
        
        const manualQuestion = ELEMENT_MAPPING[aiElement] || aiElement;
        const manualEntry = appManualData[manualQuestion];
        
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
        const manualEntry = appManualData[manualQuestion];
        
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
        const manualEntry = appManualData[manualQuestion];
        
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
  
  const successRate = totalElements > 0 ? ((matchingElements / totalElements) * 100).toFixed(1) : '0.0';
  
  return {
    comparison,
    stats: {
      totalElements,
      matchingElements,
      mismatchElements,
      missingInAI,
      missingInManual,
      successRate
    }
  };
}

// Generate consolidated Excel report
async function generateConsolidatedReport(allComparisons, allStats) {
  const workbook = new ExcelJS.Workbook();
  
  // Create Master Summary sheet
  const summarySheet = workbook.addWorksheet('Master Summary');
  summarySheet.columns = [
    { header: 'Application Number', key: 'appNumber', width: 20 },
    { header: 'Total Elements', key: 'totalElements', width: 15 },
    { header: 'Matches', key: 'matches', width: 12 },
    { header: 'Mismatches', key: 'mismatches', width: 12 },
    { header: 'Missing in AI', key: 'missingAI', width: 15 },
    { header: 'Missing in Manual', key: 'missingManual', width: 18 },
    { header: 'Success Rate (%)', key: 'successRate', width: 18 }
  ];
  
  // Style header
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  
  // Add data for each application
  Object.keys(allStats).forEach(appNumber => {
    const stats = allStats[appNumber];
    const row = summarySheet.addRow({
      appNumber: appNumber,
      totalElements: stats.totalElements,
      matches: stats.matchingElements,
      mismatches: stats.mismatchElements,
      missingAI: stats.missingInAI,
      missingManual: stats.missingInManual,
      successRate: stats.successRate
    });
    
    // Color code success rate
    const successRateCell = row.getCell('successRate');
    const rate = parseFloat(stats.successRate);
    if (rate >= 90) {
      successRateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } };
    } else if (rate >= 70) {
      successRateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
    } else {
      successRateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
      successRateCell.font = { color: { argb: 'FFFFFFFF' } };
    }
  });
  
  // Add overall statistics
  const totalApps = Object.keys(allStats).length;
  const avgSuccessRate = (Object.values(allStats).reduce((sum, s) => sum + parseFloat(s.successRate), 0) / totalApps).toFixed(1);
  
  summarySheet.addRow([]);
  summarySheet.addRow(['Overall Statistics']);
  summarySheet.addRow(['Total Applications', totalApps]);
  summarySheet.addRow(['Average Success Rate', `${avgSuccessRate}%`]);
  
  // Create Detailed Comparison sheet
  const detailSheet = workbook.addWorksheet('All Comparisons');
  detailSheet.columns = [
    { header: 'Application Number', key: 'applicationNumber', width: 20 },
    { header: 'Section', key: 'section', width: 30 },
    { header: 'Element', key: 'element', width: 50 },
    { header: 'AI Status', key: 'aiStatus', width: 18 },
    { header: 'Manual Status', key: 'manualStatus', width: 18 },
    { header: 'Match Status', key: 'match', width: 18 },
    { header: 'AI Reasoning', key: 'aiReasoning', width: 60 },
    { header: 'AI Evidence', key: 'aiEvidence', width: 60 },
    { header: 'Manual Comment', key: 'manualComment', width: 60 },
    { header: 'Notes', key: 'notes', width: 40 }
  ];
  
  // Style header
  detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  detailSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  
  // Enable filters
  detailSheet.autoFilter = {
    from: 'A1',
    to: 'J1'
  };
  
  // Add all comparison data
  allComparisons.forEach(item => {
    const row = detailSheet.addRow(item);
    
    // Color code match status
    const matchCell = row.getCell('match');
    if (item.match === 'MATCH') {
      matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } };
      matchCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    } else if (item.match === 'MISMATCH') {
      matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
      matchCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    } else {
      matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      matchCell.font = { bold: true };
    }
  });
  
  // Save workbook
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const reportPath = path.join(CONFIG.OUTPUT_DIR, `Consolidated_Comparison_${timestamp}.xlsx`);
  
  await workbook.xlsx.writeFile(reportPath);
  return reportPath;
}

// Main function
async function main() {
  try {
    logger.log('Starting consolidated comparison for all applications');
    logger.log('============================================================');
    
    // Load manual Excel data
    const manualData = await loadManualExcel();
    
    // Find all AI result files
    const aiFiles = findAIResultFiles();
    
    if (aiFiles.length === 0) {
      logger.error('No AI result files found');
      process.exit(1);
    }
    
    const allComparisons = [];
    const allStats = {};
    
    // Process each AI result file
    for (const filename of aiFiles) {
      logger.log(`Processing ${filename}...`);
      
      const aiResults = loadAIResults(filename);
      const appNumber = aiResults.applicationNumber;
      
      if (!appNumber) {
        logger.warning(`No application number found in ${filename}, skipping`);
        continue;
      }
      
      if (!manualData[appNumber]) {
        logger.warning(`No manual data found for application ${appNumber}, skipping`);
        continue;
      }
      
      const { comparison, stats } = compareApplication(aiResults, manualData, appNumber);
      
      allComparisons.push(...comparison);
      allStats[appNumber] = stats;
      
      logger.success(`Application ${appNumber}: ${stats.matchingElements}/${stats.totalElements} matches (${stats.successRate}% success rate)`);
    }
    
    // Generate consolidated report
    logger.log('Generating consolidated Excel report...');
    const reportPath = await generateConsolidatedReport(allComparisons, allStats);
    logger.success(`Consolidated report generated: ${reportPath}`);
    
    logger.log('============================================================');
    logger.log('CONSOLIDATED COMPARISON SUMMARY:');
    logger.log(`Total Applications Processed: ${Object.keys(allStats).length}`);
    
    Object.keys(allStats).forEach(appNumber => {
      const stats = allStats[appNumber];
      logger.log(`  ${appNumber}: ${stats.matchingElements}/${stats.totalElements} matches (${stats.successRate}%)`);
    });
    
    const avgSuccessRate = (Object.values(allStats).reduce((sum, s) => sum + parseFloat(s.successRate), 0) / Object.keys(allStats).length).toFixed(1);
    logger.log(`Average Success Rate: ${avgSuccessRate}%`);
    logger.log('============================================================');
    logger.success(`Report saved to: ${reportPath}`);
    
  } catch (error) {
    logger.error(`Error during consolidated comparison: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run
main();

export { loadManualExcel, loadAIResults, compareApplication, generateConsolidatedReport };
