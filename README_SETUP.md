# HRSA Compliance System - Setup Instructions

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```

This will start:
- Backend server on `http://localhost:3001` (saves/loads rules from `data/compliance-rules.json`)
- Frontend on `http://localhost:3000` (React app)

### 3. Use the Application

#### First Time:
1. Upload the HRSA Compliance Manual PDF
2. Wait for extraction (rules are saved to `data/compliance-rules.json`)
3. Analyze applications

#### After First Upload:
1. Refresh the page
2. Rules automatically load from `data/compliance-rules.json`
3. Upload section is hidden
4. Can immediately analyze applications

## File Structure

```
hrsa-compliance-react/
├── data/
│   └── compliance-rules.json  ← Rules saved here automatically
├── src/
│   └── App.jsx
├── server.js  ← Backend server
└── package.json
```

## Troubleshooting

### Backend not running
If you see "Could not save rules" error:
```bash
# Terminal 1: Start backend
npm run server

# Terminal 2: Start frontend
npm run dev
```

### Rules not loading
- Make sure backend is running (`npm run server`)
- Check `data/compliance-rules.json` exists
- Refresh the page

## Azure API Keys

Update these in `src/App.jsx`:
- `AZURE_DOC_KEY`: Azure Document Intelligence key
- `AZURE_OPENAI_KEY`: Azure OpenAI key
- `AZURE_OPENAI_DEPLOYMENT`: Your GPT-4 deployment name
