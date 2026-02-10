# Azure Portal Setup Checklist

## 🎯 What You Need to Create in Azure Portal

### Prerequisites
- Azure account (sign up at https://portal.azure.com)
- Active Azure subscription

---

## 📝 Step-by-Step Azure Resources to Create

### 1. **Azure Document Intelligence Service**

**Purpose**: Extract text from PDF applications

**Steps to Create:**
1. Login to https://portal.azure.com
2. Click **"Create a resource"**
3. Search for **"Document Intelligence"** (or "Form Recognizer")
4. Click **"Create"**
5. Fill in details:
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new → `hrsa-compliance-rg`
   - **Region**: `East US` (or your preferred region)
   - **Name**: `hrsa-doc-intelligence`
   - **Pricing Tier**: `Free F0` (for testing) or `Standard S0` (for production)
6. Click **"Review + create"** → **"Create"**
7. After deployment, go to resource
8. Click **"Keys and Endpoint"**
9. **Copy and save**:
   - ✅ **Endpoint**: `https://eastus.api.cognitive.microsoft.com/`
   - ✅ **Key 1**: (your API key)

---

### 2. **Azure OpenAI Service**

**Purpose**: AI analysis of compliance requirements

**Steps to Create:**
1. In Azure Portal, click **"Create a resource"**
2. Search for **"Azure OpenAI"**
3. Click **"Create"**
4. Fill in details:
   - **Subscription**: Select your subscription
   - **Resource Group**: Use existing `hrsa-compliance-rg`
   - **Region**: `East US` (check GPT-4 availability)
   - **Name**: `hrsa-openai-service`
   - **Pricing Tier**: `Standard S0`
5. Click **"Review + create"** → **"Create"**
6. After deployment, go to resource
7. Click **"Keys and Endpoint"**
8. **Copy and save**:
   - ✅ **Endpoint**: `https://dmiai.openai.azure.com/`
   - ✅ **Key 1**: (your API key)

**Deploy GPT-4 Model:**
1. In your Azure OpenAI resource, click **"Model deployments"**
2. Click **"Create new deployment"**
3. Fill in:
   - **Model**: Select `gpt-4` or `gpt-4-32k`
   - **Deployment name**: `gpt-4`
   - **Model version**: Latest available
4. Click **"Create"**
5. **Copy deployment name**: `gpt-4`

---

### 3. **Azure App Service (Web App)** - For Hosting

**Purpose**: Host your React application and Node.js backend

**Steps to Create:**
1. In Azure Portal, click **"Create a resource"**
2. Search for **"Web App"**
3. Click **"Create"**
4. Fill in details:
   - **Subscription**: Select your subscription
   - **Resource Group**: Use existing `hrsa-compliance-rg`
   - **Name**: `hrsa-compliance-app` (must be globally unique)
   - **Publish**: `Code`
   - **Runtime stack**: `Node 18 LTS`
   - **Operating System**: `Linux`
   - **Region**: `East US` (same as other resources)
   - **App Service Plan**: Create new
     - **Name**: `hrsa-app-plan`
     - **Pricing Tier**: `Basic B1` (for testing) or `Standard S1` (for production)
5. Click **"Review + create"** → **"Create"**
6. After deployment, go to resource
7. **Copy and save**:
   - ✅ **URL**: `https://hrsa-compliance-app.azurewebsites.net`

---

### 4. **Configure App Service Environment Variables**

**After creating the Web App:**

1. Go to your Web App resource
2. Click **"Configuration"** (under Settings)
3. Click **"Application settings"** tab
4. Click **"+ New application setting"** for each:

   | Name | Value |
   |------|-------|
   | `VITE_AZURE_DOC_ENDPOINT` | (Your Document Intelligence endpoint) |
   | `VITE_AZURE_DOC_KEY` | (Your Document Intelligence key) |
   | `VITE_AZURE_OPENAI_ENDPOINT` | (Your Azure OpenAI endpoint) |
   | `VITE_AZURE_OPENAI_KEY` | (Your Azure OpenAI key) |
   | `VITE_AZURE_OPENAI_DEPLOYMENT` | `gpt-4` |
   | `PORT` | `8080` |

5. Click **"Save"** at the top
6. Click **"Continue"** to restart the app

---

## 📊 Summary of What You Created

| Resource | Purpose | What to Copy |
|----------|---------|--------------|
| **Document Intelligence** | PDF text extraction | Endpoint + Key |
| **Azure OpenAI** | AI compliance analysis | Endpoint + Key + Deployment name |
| **Web App** | Host application | URL |

---

## 🔑 Your Credentials Template

After creating all resources, you'll have:

```env
# Document Intelligence
VITE_AZURE_DOC_ENDPOINT=https://eastus.api.cognitive.microsoft.com/
VITE_AZURE_DOC_KEY=your_doc_intelligence_key_here

# Azure OpenAI
VITE_AZURE_OPENAI_ENDPOINT=https://your-openai-name.openai.azure.com/
VITE_AZURE_OPENAI_KEY=your_openai_key_here
VITE_AZURE_OPENAI_DEPLOYMENT=gpt-4

# Backend URL
VITE_BACKEND_URL=https://hrsa-compliance-app.azurewebsites.net
```

---

## 💰 Cost Estimates (Approximate)

| Resource | Free Tier | Paid Tier (Monthly) |
|----------|-----------|---------------------|
| Document Intelligence | 500 pages/month free | ~$1-10 per 1000 pages |
| Azure OpenAI | No free tier | ~$0.03 per 1K tokens (GPT-4) |
| App Service | No free tier | ~$13/month (Basic B1) |

**Total estimated cost**: $15-50/month depending on usage

---

## ✅ Verification Checklist

After creating everything, verify:

- [ ] Document Intelligence service is created and running
- [ ] Azure OpenAI service is created with GPT-4 deployed
- [ ] Web App is created and running
- [ ] All API keys and endpoints are copied
- [ ] Environment variables are configured in Web App
- [ ] All resources are in the same Resource Group
- [ ] All resources are in the same Region (for better performance)

---

## 🚀 Next Steps After Azure Setup

1. **Update your local `.env` file** with the credentials
2. **Test locally** to ensure everything works
3. **Build your application**: `npm run build`
4. **Deploy to Azure Web App** using one of these methods:
   - Azure CLI: `az webapp up`
   - GitHub Actions (automated)
   - Azure Portal deployment center

---

## 🆘 Troubleshooting

### Can't find Azure OpenAI?
- Azure OpenAI requires approval. Apply at: https://aka.ms/oai/access
- May take 1-2 business days for approval

### Resource creation fails?
- Check if you have sufficient permissions
- Verify your subscription is active
- Try a different region if resource is not available

### Need help?
- Azure Support: https://azure.microsoft.com/support/
- Azure Documentation: https://docs.microsoft.com/azure/

---

**Created**: January 23, 2026
