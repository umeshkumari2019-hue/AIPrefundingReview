# Quick Setup Guide - Batch Processor

## 🚀 Quick Start (5 minutes)

### Step 1: Install Dependencies

Open PowerShell in the project folder and run:

```powershell
npm install axios docx form-data
```

### Step 2: Ensure Backend is Running

```powershell
npm run server
```

Keep this terminal open - the backend must stay running during batch processing.

### Step 3: Upload Guiding Principles Document

1. Open the main application: `npm run dev:full`
2. Go to "1. Upload Manual" tab
3. Upload your Guiding Principles Document PDF
4. Wait for rules extraction to complete
5. Verify `compliance-rules.json` file is created in the project folder

### Step 4: Prepare Your Application PDFs

1. Create a folder with all application PDFs (e.g., `C:\Applications\Batch1`)
2. **Important**: Ensure filenames contain application numbers
   - ✅ Good: `242897_application.pdf`, `24-2897.pdf`, `App_242897.pdf`
   - ❌ Bad: `application1.pdf`, `document.pdf`

### Step 5: Run Batch Processor

**Option A: Using Node.js**
```powershell
node batch-processor.js
```

**Option B: Using Batch File (Double-click)**
```
run-batch-processor.bat
```

### Step 6: Follow Prompts

```
Enter the folder path containing PDF applications: C:\Applications\Batch1
Found 80 PDF files to process
Process 80 applications? (yes/no): yes
```

### Step 7: Wait for Completion

- Processing time: ~23 seconds per application
- For 80 applications: ~30-35 minutes
- Monitor progress in real-time
- Log file is created automatically

### Step 8: Review Results

Results are saved to: `[Your Folder]\Analysis_Results\`

**You'll find:**
- 📄 Word documents (one per application)
- 📊 JSON files (for Excel comparison)
- 📋 Processing log
- 📈 Batch summary

---

## 🔧 Building as Standalone .exe

If you want to create a standalone executable that doesn't require Node.js:

### Step 1: Install pkg globally

```powershell
npm install -g pkg
```

### Step 2: Build the executable

```powershell
pkg batch-processor.js --targets node18-win-x64 --output dist/hrsa-batch-processor.exe
```

### Step 3: Copy required files

```powershell
# Create dist folder if it doesn't exist
mkdir dist -Force

# Copy compliance rules
copy compliance-rules.json dist\

# Copy the exe (already created in dist folder)
```

### Step 4: Distribute

You can now copy the `dist` folder to any Windows machine and run:

```powershell
.\hrsa-batch-processor.exe
```

**No Node.js installation required!**

---

## 📊 Excel Comparison Setup

After batch processing, you can compare results with your Excel file:

### JSON Structure Matches Excel

The JSON output includes:
- `applicationNumber` → matches your Excel `EHBTrackingNo` column
- `sections` → contains all section results
- `summary` → compliance statistics

### To Compare:

1. Load JSON files from `Analysis_Results` folder
2. Match `applicationNumber` with Excel `EHBTrackingNo`
3. Compare section results
4. Use the main application's "Compare" tab for detailed comparison

---

## ⚙️ Rate Limiting Configuration

For 80 applications, the default settings should work well:

```javascript
DELAY_BETWEEN_REQUESTS: 2000      // 2 seconds between API calls
DELAY_BETWEEN_APPLICATIONS: 5000  // 5 seconds between applications
```

**If you encounter rate limit errors:**

1. Edit `batch-processor.js`
2. Increase the delays:
   ```javascript
   DELAY_BETWEEN_REQUESTS: 3000      // 3 seconds
   DELAY_BETWEEN_APPLICATIONS: 10000 // 10 seconds
   ```
3. This will increase total processing time but reduce errors

---

## 🐛 Troubleshooting

### "Cannot find module 'axios'"
```powershell
npm install axios docx form-data
```

### "Failed to load compliance rules"
1. Upload Guiding Principles Document in main app first
2. Check if `compliance-rules.json` exists

### "Connection refused" or "ECONNREFUSED"
```powershell
# Start the backend server
npm run server
```

### "Rate limit exceeded"
- The utility will automatically retry
- If it keeps failing, increase delays in config
- Consider processing in smaller batches (20-30 at a time)

### Application number not extracted
- Ensure PDF filename contains the number
- Supported formats: 6-7 digits (242897, 24-2897)
- Files without numbers will be named `app_1`, `app_2`, etc.

---

## 📝 Processing Log Example

```
[2026-01-21T14:00:00.000Z] [INFO] ================================================
[2026-01-21T14:00:00.000Z] [INFO] Batch Processing Started
[2026-01-21T14:00:00.000Z] [INFO] ================================================
[2026-01-21T14:00:00.000Z] [INFO] Input Folder: C:\Applications\Batch1
[2026-01-21T14:00:00.000Z] [INFO] Output Folder: C:\Applications\Batch1\Analysis_Results
[2026-01-21T14:00:01.000Z] [SUCCESS] Loaded 9 chapters from guiding principles document
[2026-01-21T14:00:01.000Z] [INFO] Found 80 PDF files to process
[2026-01-21T14:00:05.000Z] [INFO] ================================================
[2026-01-21T14:00:05.000Z] [INFO] Processing 1/80: 242897_application.pdf
[2026-01-21T14:00:05.000Z] [INFO] ================================================
[2026-01-21T14:00:05.000Z] [INFO] Analyzing: 242897_application.pdf (App #: 242897)
[2026-01-21T14:00:06.000Z] [INFO] Extracting text from PDF...
[2026-01-21T14:00:08.000Z] [INFO] Extracted 45230 characters from PDF
[2026-01-21T14:00:10.000Z] [INFO] Analyzing section 1/9: Needs Assessment
[2026-01-21T14:00:12.000Z] [SUCCESS] ✓ Completed section: Needs Assessment
[2026-01-21T14:00:14.000Z] [INFO] Analyzing section 2/9: Sliding Fee Discount Program
...
[2026-01-21T14:00:28.000Z] [SUCCESS] Word document saved: C:\Applications\Batch1\Analysis_Results\242897_1737468028000.docx
[2026-01-21T14:00:28.000Z] [SUCCESS] JSON data saved: C:\Applications\Batch1\Analysis_Results\242897_1737468028000.json
[2026-01-21T14:00:28.000Z] [SUCCESS] ✓ Completed: 242897_application.pdf
[2026-01-21T14:00:28.000Z] [INFO] Waiting 5s before next application...
```

---

## 📦 What You Get

### For Each Application:

**Word Document** (`242897_1737468028000.docx`)
- Full analysis report
- Summary statistics
- Section-by-section results
- Evidence and reasoning

**JSON File** (`242897_1737468028000.json`)
```json
{
  "applicationNumber": "242897",
  "filename": "242897_application.pdf",
  "timestamp": "2026-01-21T14:00:28.000Z",
  "summary": {
    "totalCompliant": 13,
    "totalNonCompliant": 3,
    "totalNotApplicable": 4,
    "complianceRate": "65.0"
  },
  "sections": { ... }
}
```

### Batch Summary:

**Processing Log** (`processing_log_1737468000000.txt`)
- Complete activity log
- Timestamps for all actions
- Error messages if any

**Batch Summary** (`batch_summary_1737468000000.json`)
```json
{
  "results": [
    {
      "filename": "242897_application.pdf",
      "applicationNumber": "242897",
      "status": "SUCCESS",
      "wordDocument": "...",
      "jsonData": "..."
    }
  ],
  "errors": [],
  "timestamp": "2026-01-21T14:35:00.000Z"
}
```

---

## 🎯 Best Practices

1. **Test First**: Process 2-3 applications before running the full batch
2. **Off-Peak Hours**: Run during off-peak hours to minimize rate limits
3. **Keep Backend Running**: Don't close the backend server terminal
4. **Monitor Progress**: Watch the console for any errors
5. **Backup PDFs**: Keep a backup of your original PDFs
6. **Review Log**: Check the processing log after completion

---

## ✅ Checklist Before Running

- [ ] Backend server is running (`npm run server`)
- [ ] Guiding Principles Document uploaded and rules extracted
- [ ] `compliance-rules.json` file exists
- [ ] Application PDFs are in a single folder
- [ ] PDF filenames contain application numbers
- [ ] Dependencies installed (`npm install axios docx form-data`)
- [ ] Tested with 2-3 applications first

---

## 📞 Need Help?

Check these files for more information:
- `BATCH_PROCESSOR_README.md` - Detailed documentation
- `processing_log_[timestamp].txt` - Your processing log
- `batch_summary_[timestamp].json` - Results summary

**Common Issues:**
- Rate limits → Increase delays in config
- Connection errors → Check backend server
- Missing rules → Upload Guiding Principles Document first
- No application number → Ensure filename contains number
