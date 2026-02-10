# Simple Setup Guide

## 3 Steps to Get Started

### Step 1: Install

```bash
cd Y:\Umesh\hrsa-compliance-react
npm install
```

### Step 2: Add API Keys

Open `src/App.jsx` in any text editor and replace:

```javascript
// Around line 5-9
const AZURE_ENDPOINT = 'YOUR_AZURE_ENDPOINT'  // Replace with your Azure endpoint
const AZURE_KEY = 'YOUR_AZURE_KEY'            // Replace with your Azure key
const OPENAI_API_KEY = 'YOUR_OPENAI_KEY'      // Replace with your OpenAI key
```

**Where to get keys:**

**Azure:**
- Go to https://portal.azure.com
- Create "Document Intelligence" resource
- Go to "Keys and Endpoint"
- Copy Endpoint (e.g., `https://your-resource.cognitiveservices.azure.com/`)
- Copy Key 1

**OpenAI:**
- Go to https://platform.openai.com/api-keys
- Click "Create new secret key"
- Copy the key (starts with `sk-`)

### Step 3: Run

```bash
npm run dev
```

Browser opens automatically to: **http://localhost:3000**

---

## That's It!

No backend, no database, no complex setup. Just a simple React app!

---

## Usage

1. **Upload Manual** - Upload HRSA Compliance Manual PDF
2. **Analyze App** - Upload application PDF
3. **View Results** - See compliance results

Processing takes 2-5 minutes total.
