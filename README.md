# HRSA Compliance System - Simple React App

A simple, single-page React application for HRSA compliance validation using Azure Document Intelligence and OpenAI.

## ✨ Features

- ✅ **Single Page App** - No complex backend needed
- ✅ **Azure Document Intelligence** - Direct PDF text extraction
- ✅ **OpenAI GPT-4** - AI-powered compliance analysis
- ✅ **Beautiful UI** - Modern, gradient design
- ✅ **Drag & Drop** - Easy file uploads
- ✅ **Real-time Processing** - See progress as it happens

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
cd Y:\Umesh\hrsa-compliance-react
npm install
```

### Step 2: Add Your API Keys

Edit `src/App.jsx` and replace these lines:

```javascript
// Line 5-6
const AZURE_ENDPOINT = 'https://your-resource.cognitiveservices.azure.com/'
const AZURE_KEY = 'your-azure-key'

// Line 9
const OPENAI_API_KEY = 'sk-your-openai-key'
```

### Step 3: Start the App

```bash
npm run dev
```

Open: **http://localhost:3000**

## 📋 How to Use

### 1. Upload Compliance Manual
- Click "Upload Manual" tab
- Drag & drop or click to upload HRSA Compliance Manual PDF
- Click "Extract Compliance Rules"
- Wait 1-2 minutes for AI to extract requirements

### 2. Analyze Application
- Click "Analyze Application" tab
- Enter application name
- Upload application PDF
- Click "Analyze Compliance"
- Wait 2-5 minutes for analysis

### 3. View Results
- Click "View Results" tab
- See compliance status for all 9 sections
- View compliant items with evidence
- View non-compliant items with reasons

## 🔑 Get API Keys

### Azure Document Intelligence
1. Go to https://portal.azure.com
2. Create "Document Intelligence" resource
3. Copy Endpoint and Key

### OpenAI
1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Copy the key

## 📦 What's Included

- **React 18** - Modern React with hooks
- **Vite** - Fast development server
- **Axios** - HTTP requests
- **Beautiful CSS** - Gradient design with animations

## ✅ Advantages

- ✅ No backend server needed
- ✅ No database setup
- ✅ No complex configuration
- ✅ Just 3 files to edit
- ✅ Works entirely in browser
- ✅ Fast and simple

## 🎯 Supported Sections

1. Needs Assessment
2. Sliding Fee Discount
3. Key Management Staff
4. Contracts & Subawards
5. Collaborative Relationships
6. Billing & Collections
7. Budget
8. Board Authority
9. Board Composition

## 🔧 Troubleshooting

**CORS errors?**
- Azure and OpenAI APIs support CORS by default
- Make sure your API keys are correct

**Slow processing?**
- Normal - AI analysis takes 2-5 minutes
- Each section is analyzed individually

**API errors?**
- Check your API keys in `src/App.jsx`
- Verify you have GPT-4 access
- Check Azure endpoint ends with `/`

## 📁 Project Structure

```
hrsa-compliance-react/
├── src/
│   ├── App.jsx          # Main application
│   ├── main.jsx         # React entry point
│   └── index.css        # Styles
├── index.html           # HTML template
├── package.json         # Dependencies
└── vite.config.js       # Vite configuration
```

## 🎉 That's It!

Super simple - just install, add API keys, and run!
