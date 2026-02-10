# HRSA Compliance Analysis Comparison Tool

This guide explains how to run the batch processor and compare AI results with manual Excel reviews.

## Overview

The comparison system consists of two main components:

1. **Batch Processor** (`batch-processor.js`) - Processes PDF applications and generates JSON + Word outputs
2. **Comparison Tool** (`compare-results.js`) - Compares AI JSON results with manual Excel data

## Step 1: Run Batch Processor

The batch processor is currently configured to process **only 1 application** for testing/comparison purposes.

### Configuration

In `batch-processor.js`, line 43:
```javascript
MAX_APPLICATIONS: 1, // Set to null or 0 to process all applications
```

### Run the Batch Processor

```bash
node batch-processor.js
```

**What it does:**
- Processes the first PDF application in the input folder
- Extracts text using Azure Document Intelligence
- Analyzes compliance using GPT-4 with sequential processing
- Generates outputs:
  - `{applicationNumber}_{timestamp}.json` - Structured JSON results
  - `{applicationNumber}_{timestamp}.docx` - Word document report
- Saves to: `Y:\Umesh\hrsa-compliance-react\batch-results\`

**Processing Details:**
- Uses GPT-4 deployment (not gpt-4o)
- Sequential processing (1 section at a time)
- 25 second delays between sections
- Retry logic with exponential backoff (30s, 60s, 90s)
- Text compression (~10% reduction)

## Step 2: Run Comparison Tool

After the batch processor completes, run the comparison tool to validate AI results against manual Excel.

### Run the Comparison

```bash
node compare-results.js 242645
```

Replace `242645` with your application number. If no argument provided, it uses the default from config.

**What it does:**
- Loads manual Excel file: `Y:\Umesh\OneDrive_1_1-21-2026\ManualExcel\SAC_PAR_Compliance_Answers_HRSA-26-004.xlsx`
- Loads AI JSON results from: `Y:\Umesh\hrsa-compliance-react\batch-results\{applicationNumber}_analysis.json`
- Compares each compliance element:
  - AI Status vs Manual Status
  - Element-by-element matching
  - Identifies mismatches and missing elements
- Generates comparison Excel report

## Step 3: Review Comparison Report

The comparison tool generates an Excel file with two sheets:

### Sheet 1: Detailed Comparison

| Column | Description |
|--------|-------------|
| Application Number | The application tracking number |
| Section | Compliance section (e.g., "Sliding Fee Discount Program") |
| Element | Specific requirement element (e.g., "b - Sliding Fee Discount Program Policies") |
| AI Status | AI determination (COMPLIANT, NON-COMPLIANT, NOT APPLICABLE) |
| Manual Status | Manual reviewer determination |
| Match Status | MATCH, MISMATCH, or MISSING |
| AI Reasoning | AI's reasoning for the determination |
| AI Evidence | Evidence cited by AI |
| Manual Comment | Manual reviewer's comment |
| Notes | Additional notes about discrepancies |

**Color Coding:**
- 🟢 **Green** - MATCH (AI and manual agree)
- 🔴 **Red** - MISMATCH (AI and manual disagree)
- 🟠 **Orange** - MISSING (element found in one but not the other)

**Filters:**
- Use Excel autofilter on row 1 to filter by:
  - Application Number
  - Section
  - Match Status
  - AI Status
  - Manual Status

### Sheet 2: Summary Statistics

Shows overall performance metrics:
- **Application Number**
- **Total Elements Compared**
- **Matching Elements**
- **Mismatched Elements**
- **Missing in AI Results**
- **Missing in Manual Excel**
- **Success Percentage** (color-coded: green ≥80%, yellow ≥60%, red <60%)

## Output Locations

```
Y:\Umesh\hrsa-compliance-react\
├── batch-results\
│   ├── {appNumber}_{timestamp}.json     ← AI results (JSON)
│   ├── {appNumber}_{timestamp}.docx     ← AI results (Word)
│   └── batch_summary_{timestamp}.json   ← Batch processing summary
│
└── comparison-results\
    └── Comparison_{appNumber}_{timestamp}.xlsx  ← Comparison report
```

## Configuration Files

### Batch Processor Config (`batch-processor.js`)

```javascript
const CONFIG = {
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
  MAX_APPLICATIONS: 1,              // Limit to 1 for testing
  DELAY_BETWEEN_REQUESTS: 2000,     // 2 seconds
  DELAY_BETWEEN_APPLICATIONS: 5000, // 5 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 10000                // 10 seconds
};
```

### Comparison Tool Config (`compare-results.js`)

```javascript
const CONFIG = {
  MANUAL_EXCEL_PATH: 'Y:\\Umesh\\OneDrive_1_1-21-2026\\ManualExcel\\SAC_PAR_Compliance_Answers_HRSA-26-004.xlsx',
  AI_RESULTS_DIR: 'Y:\\Umesh\\hrsa-compliance-react\\batch-results',
  OUTPUT_DIR: 'Y:\\Umesh\\hrsa-compliance-react\\comparison-results',
  APPLICATION_NUMBER: '242645'
};
```

## Element Mapping

The comparison tool maps AI element names to manual Excel question format:

| AI Element | Manual Excel Question |
|------------|----------------------|
| `b - Update of Needs Assessment` | `b. Update of Needs Assessment` |
| `b - Sliding Fee Discount Program Policies` | `b. Sliding Fee Discount Program Policies` |
| `c - Sliding Fee for Column I Services` | `c. Sliding Fee for Column I Services` |
| ... and 19 more elements |

## Troubleshooting

### Issue: AI results file not found
**Solution:** Ensure batch processor completed successfully and JSON file exists in `batch-results/`

### Issue: Manual Excel not found
**Solution:** Verify the path in CONFIG.MANUAL_EXCEL_PATH points to correct Excel file

### Issue: No matching elements
**Solution:** Check that application number matches between AI results and manual Excel

### Issue: Rate limit errors during batch processing
**Solution:** 
- Verify GPT-4 deployment has sufficient quota (450K TPM)
- Increase delays between sections if needed
- Check Azure OpenAI service health

## Processing Multiple Applications

To process more than 1 application:

1. Edit `batch-processor.js` line 43:
   ```javascript
   MAX_APPLICATIONS: null, // or set to desired number
   ```

2. Run batch processor for all applications

3. Run comparison tool for each application:
   ```bash
   node compare-results.js 242645
   node compare-results.js 242646
   node compare-results.js 242647
   ```

## Success Metrics

**Target Success Rate:** ≥80% match rate between AI and manual reviews

**Acceptable Discrepancies:**
- Interpretation differences on borderline cases
- Different evidence cited but same conclusion
- N/A vs Compliant for optional elements

**Unacceptable Discrepancies:**
- Compliant vs Non-Compliant mismatches
- Missing required elements
- Incorrect status determinations

## Next Steps

1. ✅ Run batch processor on test application
2. ✅ Generate comparison report
3. 📊 Review detailed comparison sheet
4. 🔍 Investigate mismatches
5. 🔧 Adjust AI prompts/rules if needed
6. 🔄 Reprocess and compare again
7. 📈 Track success percentage over time

---

**Last Updated:** January 22, 2026  
**Version:** 1.0
