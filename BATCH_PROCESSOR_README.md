# HRSA Pre-Funding Review - Batch Processing Utility

## Overview

This standalone utility processes multiple application PDFs in batch mode with:
- ✅ **Rate limiting** to handle API token limits (configurable delays)
- ✅ **Word document generation** for each application
- ✅ **Structured JSON output** for Excel comparison (matches EHBTrackingNo)
- ✅ **Processing log** with timestamps and status
- ✅ **Error handling** with automatic retries
- ✅ **Progress tracking** for large batches (80+ applications)

## Prerequisites

1. **Backend server must be running** on `http://localhost:3001`
2. **Guiding Principles Document** must be uploaded and rules saved to `compliance-rules.json`
3. **Node.js** installed (v18 or higher)

## Installation

### Option 1: Run as Node.js Script

1. Install dependencies:
```powershell
npm install axios docx form-data
```

2. Run the batch processor:
```powershell
node batch-processor.js
```

### Option 2: Build as Standalone Executable (.exe)

1. Install dependencies and pkg:
```powershell
npm install axios docx form-data
npm install -g pkg
```

2. Build the executable:
```powershell
pkg batch-processor.js --targets node18-win-x64 --output dist/hrsa-batch-processor.exe
```

3. Copy `compliance-rules.json` to the same folder as the .exe

4. Run the executable:
```powershell
.\dist\hrsa-batch-processor.exe
```

## Usage

### Step 1: Prepare Your Files

1. Place all application PDFs in a single folder
2. **Important**: PDF filenames should contain the application number (e.g., `242897_application.pdf` or `24-2897.pdf`)
3. Ensure the backend server is running

### Step 2: Run the Batch Processor

```powershell
node batch-processor.js
```

Or if using the .exe:
```powershell
.\hrsa-batch-processor.exe
```

### Step 3: Follow the Prompts

1. **Enter folder path**: Provide the full path to the folder containing PDFs
   ```
   Example: C:\Users\YourName\Documents\Applications
   ```

2. **Confirm processing**: Type `yes` to start processing

### Step 4: Monitor Progress

The utility will:
- Display real-time progress for each application
- Show which section is being analyzed
- Log all activities with timestamps
- Handle rate limits automatically with delays

### Step 5: Review Results

All results are saved to: `[Input Folder]\Analysis_Results\`

**For each application, you'll get:**
- 📄 **Word Document** (`[AppNumber]_[timestamp].docx`) - Full analysis report
- 📊 **JSON File** (`[AppNumber]_[timestamp].json`) - Structured data for Excel comparison
- 📋 **Processing Log** (`processing_log_[timestamp].txt`) - Complete activity log
- 📈 **Batch Summary** (`batch_summary_[timestamp].json`) - Overall results summary

## Output Format

### Word Document Structure
```
HRSA Pre-Funding Review Report
Application: [Application Number]

Summary Statistics
├── Total Requirements: X
├── ✅ Compliant: X
├── ❌ Non-Compliant: X
└── ⊘ Not Applicable: X

[Section Name]
├── [Element Name]
│   ├── Status: COMPLIANT/NON-COMPLIANT/NOT APPLICABLE
│   ├── Requirement: [text]
│   ├── Evidence: [text]
│   └── Reasoning: [text]
```

### JSON Structure (for Excel Comparison)
```json
{
  "applicationNumber": "242897",
  "filename": "242897_application.pdf",
  "timestamp": "2026-01-21T14:00:00.000Z",
  "summary": {
    "totalCompliant": 13,
    "totalNonCompliant": 3,
    "totalNotApplicable": 4,
    "complianceRate": "65.0"
  },
  "sections": {
    "Needs Assessment": {
      "compliant": [...],
      "nonCompliant": [...],
      "notApplicable": [...]
    }
  }
}
```

## Excel Comparison

The JSON output is designed to match your Excel format:

1. **Application Number**: Extracted from filename → matches `EHBTrackingNo` column
2. **Section Results**: Can be compared against Excel columns
3. **Compliance Status**: COMPLIANT/NON-COMPLIANT/NOT APPLICABLE

### To Compare with Excel:

1. Load the JSON files from `Analysis_Results` folder
2. Match `applicationNumber` field with Excel `EHBTrackingNo` column
3. Compare section-by-section results
4. Use the main application to upload Excel and JSON for side-by-side comparison

## Rate Limiting Configuration

The utility includes built-in rate limiting to handle API token limits:

**Default Settings:**
- `DELAY_BETWEEN_REQUESTS`: 2 seconds (between API calls within same application)
- `DELAY_BETWEEN_APPLICATIONS`: 5 seconds (between different applications)
- `MAX_RETRIES`: 3 attempts
- `RETRY_DELAY`: 10 seconds (when rate limit is hit)

**To adjust settings**, edit `batch-processor.js`:
```javascript
const CONFIG = {
  DELAY_BETWEEN_REQUESTS: 2000,      // Increase if hitting rate limits
  DELAY_BETWEEN_APPLICATIONS: 5000,  // Increase for more conservative processing
  MAX_RETRIES: 3,
  RETRY_DELAY: 10000,
};
```

### Estimated Processing Time

For **80 applications** with **9 sections** each:
- ~2 seconds per section × 9 sections = ~18 seconds per application
- +5 seconds delay between applications
- **Total: ~23 seconds per application**
- **80 applications: ~30-35 minutes**

*Note: Actual time may vary based on PDF size, API response time, and rate limiting.*

## Troubleshooting

### Issue: "Failed to load compliance rules"
**Solution**: 
1. Upload Guiding Principles Document in the main application first
2. Ensure `compliance-rules.json` exists in the same folder as the script/exe

### Issue: "Rate limit exceeded" errors
**Solution**: 
1. Increase `DELAY_BETWEEN_REQUESTS` and `DELAY_BETWEEN_APPLICATIONS`
2. The utility will automatically retry with delays
3. Consider processing in smaller batches

### Issue: "Backend connection failed"
**Solution**: 
1. Ensure backend server is running: `npm run server`
2. Check `BACKEND_URL` in the script (default: `http://localhost:3001`)

### Issue: "Cannot extract application number"
**Solution**: 
1. Ensure PDF filenames contain the application number
2. Supported formats: `242897`, `24-2897`, or any 6-7 digit number
3. Files without numbers will be named `app_1`, `app_2`, etc.

## Processing Log

The processing log includes:
- Start/end timestamps
- Each application processed
- Section-by-section progress
- Success/failure status
- Error messages with details
- Summary statistics

**Example log entry:**
```
[2026-01-21T14:00:00.000Z] [INFO] Processing 1/80: 242897_application.pdf
[2026-01-21T14:00:05.000Z] [INFO] Analyzing section 1/9: Needs Assessment
[2026-01-21T14:00:07.000Z] [SUCCESS] ✓ Completed section: Needs Assessment
[2026-01-21T14:00:25.000Z] [SUCCESS] ✓ Completed: 242897_application.pdf
```

## Environment Variables

You can override default settings using environment variables:

```powershell
$env:BACKEND_URL = "http://localhost:3001"
$env:AZURE_DOC_ENDPOINT = "https://eastus.api.cognitive.microsoft.com/"
$env:AZURE_DOC_KEY = "your-key-here"
$env:AZURE_OPENAI_ENDPOINT = "https://dmiai.openai.azure.com/"
$env:AZURE_OPENAI_KEY = "your-key-here"
$env:AZURE_OPENAI_DEPLOYMENT = "gpt-4"

node batch-processor.js
```

## Best Practices

1. **Process during off-peak hours** to avoid rate limits
2. **Test with 2-3 applications first** before running full batch
3. **Keep the backend server running** throughout the entire batch
4. **Monitor the log file** for any errors or warnings
5. **Back up your input PDFs** before processing
6. **Review the batch summary** after completion

## Support

For issues or questions:
1. Check the processing log for detailed error messages
2. Review the batch summary JSON for failed applications
3. Test individual applications in the main UI first
4. Verify backend server is running and accessible

## Version History

- **v1.0.0** (2026-01-21)
  - Initial release
  - Batch processing with rate limiting
  - Word document generation
  - JSON output for Excel comparison
  - Processing log and summary
