# Azure Web App Deployment Guide - HRSA Compliance System

## Step-by-Step Deployment Instructions

### Prerequisites
- Azure account (create at portal.azure.com)
- Your application code ready (already prepared ✅)

---

## Part 1: Create Azure Web App (via Azure Portal)

### Step 1: Login to Azure Portal
1. Go to **https://portal.azure.com**
2. Sign in with your Microsoft account

### Step 2: Create a Web App
1. Click **"Create a resource"** (top left)
2. Search for **"Web App"**
3. Click **"Create"**

### Step 3: Configure Basic Settings

**Subscription:**
- Select your Azure subscription

**Resource Group:**
- Click **"Create new"**
- Name: `hrsa-compliance-rg`
- Click **"OK"**

**Instance Details:**
- **Name**: `hrsa-compliance-app` (or your preferred name)
  - This will be your URL: `hrsa-compliance-app.azurewebsites.net`
- **Publish**: `Code`
- **Runtime stack**: `Node 20 LTS` (recommended - fully compatible)
  - Also works with: Node 22 or Node 24
- **Operating System**: `Linux` (recommended) or `Windows`
- **Region**: `East US` (or closest to you)

**Pricing Plan:**
- Click **"Create new"**
- Name: `hrsa-plan`
- **Pricing tier**: Click **"Explore pricing plans"**
  - For testing: `Free F1` (free, limited)
  - For production: `Basic B1` ($13/month, recommended)
- Click **"Apply"**

### Step 4: Review and Create
1. Click **"Review + create"**
2. Review all settings
3. Click **"Create"**
4. Wait 2-3 minutes for deployment to complete
5. Click **"Go to resource"**

---

## Part 2: Configure Environment Variables

### Step 1: Add Application Settings
1. In your Web App, go to **"Configuration"** (left menu under Settings)
2. Click **"Application settings"** tab
3. Click **"+ New application setting"** for each variable below:

**Add these settings one by one:**

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `VITE_AZURE_DOC_ENDPOINT` | `https://eastus.api.cognitive.microsoft.com/` |
| `VITE_AZURE_DOC_KEY` | `4584da939fd449f7aeb19db68a39b054` |
| `VITE_AZURE_OPENAI_ENDPOINT` | `https://dmiai.openai.azure.com/` |
| `VITE_AZURE_OPENAI_KEY` | `cd596bdc8c5a42b99eced7a2e872f7fd` |
| `VITE_AZURE_OPENAI_DEPLOYMENT` | `gpt-4` |
| `VITE_BACKEND_URL` | `https://hrsa-compliance-app.azurewebsites.net` |
| `ALLOWED_ORIGINS` | `https://hrsa-compliance-app.azurewebsites.net` |

**Important:** Replace `hrsa-compliance-app` with YOUR actual app name if different.

4. Click **"Save"** at the top
5. Click **"Continue"** when prompted (app will restart)

---

## Part 3: Deploy Your Code

### Option A: Deploy via VS Code (Easiest)

#### Step 1: Install Azure Extension
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for **"Azure App Service"**
4. Click **"Install"**

#### Step 2: Sign in to Azure
1. Click Azure icon in left sidebar
2. Click **"Sign in to Azure"**
3. Follow the login prompts

#### Step 3: Deploy
1. Right-click your project folder `hrsa-compliance-react`
2. Select **"Deploy to Web App..."**
3. Select your subscription
4. Select **"hrsa-compliance-app"** (your web app)
5. Click **"Deploy"**
6. Wait 5-10 minutes for deployment
7. Click **"Browse Website"** when done

---

### Option B: Deploy via ZIP File (Alternative)

#### Step 1: Prepare ZIP File
1. Open Command Prompt in your project folder:
   ```cmd
   cd Y:\Umesh\hrsa-compliance-react
   ```

2. Build the React app:
   ```cmd
   npm run build
   ```

3. Create a ZIP file containing:
   - All files EXCEPT: `node_modules`, `.git`, `.env`
   - Include: `dist` folder (created by build)

#### Step 2: Upload ZIP
1. In Azure Portal, go to your Web App
2. Click **"Advanced Tools"** (left menu under Development Tools)
3. Click **"Go →"**
4. Click **"Tools"** → **"Zip Push Deploy"**
5. Drag and drop your ZIP file
6. Wait for deployment to complete

---

### Option C: Deploy via GitHub (Best for Continuous Deployment)

#### Step 1: Push Code to GitHub
1. Create a GitHub repository
2. Push your code:
   ```cmd
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/hrsa-compliance.git
   git push -u origin main
   ```

#### Step 2: Connect GitHub to Azure
1. In Azure Portal, go to your Web App
2. Click **"Deployment Center"** (left menu)
3. **Source**: Select **"GitHub"**
4. Click **"Authorize"** and sign in to GitHub
5. **Organization**: Select your GitHub username
6. **Repository**: Select your repo
7. **Branch**: Select `main`
8. Click **"Save"**
9. Deployment will start automatically

---

## Part 4: Enable Authentication (Optional but Recommended)

### Step 1: Add Identity Provider
1. In your Web App, go to **"Authentication"** (left menu under Settings)
2. Click **"Add identity provider"**
3. **Identity provider**: Select **"Microsoft"**
4. **Tenant type**: 
   - For internal users: `Workforce (Current tenant)`
   - For external users: `Customers (Azure AD B2C)`
5. **App registration**: `Create new app registration`
6. **Name**: `HRSA Compliance Auth`
7. **Supported account types**: 
   - `Current tenant - Single tenant` (for your organization only)
   - OR `Any Azure AD directory - Multi-tenant` (for multiple organizations)
8. **Restrict access**: `Require authentication`
9. **Unauthenticated requests**: `HTTP 302 Found redirect: recommended for websites`
10. Click **"Add"**

### Step 2: Add Users (for internal auth)
1. Go to **Azure Active Directory** (search in top bar)
2. Click **"Users"** (left menu)
3. Click **"+ New user"**
4. Fill in:
   - **User name**: `john.doe@yourdomain.com`
   - **Name**: `John Doe`
   - **Password**: Auto-generate or create
   - Check **"Show password"** and copy it
5. Click **"Create"**
6. Send username and password to the user

---

## Part 5: Test Your Deployment

### Step 1: Access Your Application
1. Go to: `https://hrsa-compliance-app.azurewebsites.net`
   (Replace with your actual app name)

2. If authentication is enabled:
   - You'll be redirected to Microsoft login
   - Sign in with the user account you created
   - Accept permissions
   - You'll be redirected to the app

3. Test functionality:
   - Upload HRSA Compliance Manual
   - Upload Application PDF
   - Run analysis
   - Check results

### Step 2: Monitor Logs (if issues occur)
1. In Azure Portal, go to your Web App
2. Click **"Log stream"** (left menu under Monitoring)
3. Watch for errors in real-time

---

## Part 6: Custom Domain (Optional)

### If you want a custom domain like `compliance.yourcompany.com`:

1. Go to **"Custom domains"** (left menu)
2. Click **"+ Add custom domain"**
3. Enter your domain: `compliance.yourcompany.com`
4. Follow DNS configuration instructions
5. Add SSL certificate (free with Azure)

---

## Troubleshooting

### Issue: "Application Error" on website
**Solution:**
1. Check logs in **"Log stream"**
2. Verify all environment variables are set correctly
3. Ensure `NODE_ENV=production` is set

### Issue: "Cannot find module" errors
**Solution:**
1. In **"Configuration"** → **"General settings"**
2. **Startup Command**: `node server.js`
3. Click **"Save"**

### Issue: React app shows blank page
**Solution:**
1. Verify build was successful: Check `dist` folder exists
2. Check browser console for errors
3. Verify `VITE_BACKEND_URL` points to your Azure app URL

### Issue: API calls failing
**Solution:**
1. Check `VITE_BACKEND_URL` in Application Settings
2. Should be: `https://your-app-name.azurewebsites.net` (no trailing slash)
3. Check `ALLOWED_ORIGINS` includes your app URL

---

## Cost Management

### Free Tier Limitations:
- 60 CPU minutes/day
- 1 GB disk space
- 1 GB RAM
- Good for testing only

### Basic B1 ($13/month):
- Always on
- 1.75 GB RAM
- 10 GB storage
- Custom domains
- SSL certificates
- Recommended for production

### To Monitor Costs:
1. Azure Portal → **"Cost Management + Billing"**
2. Set up budget alerts
3. Monitor daily spending

---

## Security Best Practices

1. **Never commit API keys to Git**
   - Use Azure Application Settings instead
   - Add `.env*` to `.gitignore`

2. **Enable HTTPS only**
   - In **"TLS/SSL settings"**
   - Turn on **"HTTPS Only"**

3. **Enable authentication**
   - Follow Part 4 above
   - Restrict to authorized users only

4. **Regular updates**
   - Keep Node.js version updated
   - Update npm packages regularly

---

## Next Steps After Deployment

1. ✅ Test all features thoroughly
2. ✅ Add authorized users
3. ✅ Set up monitoring and alerts
4. ✅ Configure backup (in **"Backups"** menu)
5. ✅ Document user access procedures
6. ✅ Train users on the system

---

## Support

**Azure Documentation:**
- https://docs.microsoft.com/azure/app-service/

**Common Issues:**
- Check **"Diagnose and solve problems"** in Azure Portal
- View **"Log stream"** for real-time errors
- Check **"Metrics"** for performance monitoring

---

## Summary

Your HRSA Compliance System is now ready for Azure deployment! 

**Your deployment URL will be:**
`https://hrsa-compliance-app.azurewebsites.net`

**With authentication enabled, users will:**
1. Go to the URL
2. Sign in with Microsoft account
3. Access the application

**All data is stored in:**
- Azure Web App file system (`/data` folder)
- Cached analyses persist across restarts
