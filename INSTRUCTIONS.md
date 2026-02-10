# HRSA Compliance System - Setup & Usage

## 🚀 Quick Start

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start the Application
```bash
npm start
```

This command starts both:
- ✅ Backend server on `http://localhost:3001`
- ✅ Frontend on `http://localhost:3000`

## 📁 How It Works

### File Storage
Rules are saved to: `Y:\Umesh\hrsa-compliance-react\data\compliance-rules.json`

This file is created automatically when you extract rules from the compliance manual.

### First Time Usage
1. **Upload Compliance Manual** → Extract rules
2. **Rules are saved** to `data/compliance-rules.json` automatically
3. **Analyze applications** immediately

### After First Upload
1. **Refresh the page** → Rules load automatically from file
2. **Upload section is hidden** → Shows loaded rules
3. **Analyze applications** without re-uploading manual

## 🔄 Workflow

```
Upload Manual → Extract Rules → Save to data/compliance-rules.json
                                           ↓
                                    Refresh Page
                                           ↓
                                  Rules Load Automatically
                                           ↓
                                  Analyze Applications
```

## 📂 File Structure

```
hrsa-compliance-react/
├── data/
│   └── compliance-rules.json  ← Rules saved here
├── src/
│   └── App.jsx               ← Frontend
├── server.js                 ← Backend (saves/loads files)
├── package.json
└── INSTRUCTIONS.md           ← This file
```

## 🔧 Troubleshooting

### "Could not save rules" error
**Solution:** Make sure backend is running
```bash
npm start
```

### Rules not loading on refresh
**Check:**
1. Backend server is running (`npm run server`)
2. File exists: `data/compliance-rules.json`
3. Refresh the browser

### Run backend and frontend separately
```bash
# Terminal 1
npm run server

# Terminal 2
npm run dev
```

## 🔑 Azure API Configuration

Update these in `src/App.jsx` (lines 5-11):
- `AZURE_DOC_ENDPOINT` and `AZURE_DOC_KEY` - Document Intelligence
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT` - OpenAI

## ✅ Features

- ✅ **Automatic file persistence** - Rules saved to JSON file
- ✅ **Auto-load on refresh** - No need to re-upload manual
- ✅ **Upload new manual** - Overwrites existing rules
- ✅ **Footer page numbers** - Matches PDF page numbers exactly
- ✅ **OCR support** - Reads scanned images
- ✅ **Table extraction** - Processes tabular data
- ✅ **Evidence-based validation** - Searches entire application
- ✅ **Detailed reasoning** - Explains compliance decisions
