# HRSA Compliance React - Build & Deployment Guide

## 📦 Build Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn package manager
- Azure account (for deployment)

### Local Development Build

1. **Install Dependencies**
   ```bash
   cd Y:\Umesh\hrsa-compliance-react
   npm install
   ```

2. **Configure Environment Variables**
   
   Update `.env` file with your Azure credentials:
   ```env
   VITE_AZURE_DOC_ENDPOINT=https://eastus.api.cognitive.microsoft.com/
   VITE_AZURE_DOC_KEY=your_document_intelligence_key
   VITE_AZURE_OPENAI_ENDPOINT=https://dmiai.openai.azure.com/
   VITE_AZURE_OPENAI_KEY=your_openai_key
   VITE_AZURE_OPENAI_DEPLOYMENT=gpt-4
   VITE_BACKEND_URL=http://localhost:3001
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   Application will run on `http://localhost:5173`

4. **Start Backend Server**
   ```bash
   node server.js
   ```
   Backend will run on `http://localhost:3001`

### Production Build

1. **Build for Production**
   ```bash
   npm run build
   ```
   This creates optimized files in the `dist/` folder.

2. **Preview Production Build**
   ```bash
   npm run preview
   ```

---

## ☁️ Azure Deployment Instructions

### Option 1: Deploy to Azure Static Web Apps (Frontend)

#### Step 1: Prepare Your Application

1. **Update Production Environment Variables**
   
   Edit `.env.production`:
   ```env
   VITE_AZURE_DOC_ENDPOINT=https://eastus.api.cognitive.microsoft.com/
   VITE_AZURE_DOC_KEY=your_document_intelligence_key
   VITE_AZURE_OPENAI_ENDPOINT=https://dmiai.openai.azure.com/
   VITE_AZURE_OPENAI_KEY=your_openai_key
   VITE_AZURE_OPENAI_DEPLOYMENT=gpt-4
   VITE_BACKEND_URL=https://your-backend-app.azurewebsites.net
   ```

2. **Build the Application**
   ```bash
   npm run build
   ```

#### Step 2: Deploy via Azure Portal

1. **Login to Azure Portal**
   - Go to https://portal.azure.com
   - Sign in with your Azure account

2. **Create Static Web App**
   - Click "Create a resource"
   - Search for "Static Web App"
   - Click "Create"

3. **Configure Static Web App**
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new or select existing
   - **Name**: `hrsa-compliance-frontend`
   - **Plan type**: Free (for development) or Standard (for production)
   - **Region**: Choose closest region (e.g., East US)
   - **Deployment source**: Choose "Other" (manual deployment)

4. **Review and Create**
   - Click "Review + create"
   - Click "Create"
   - Wait for deployment to complete

#### Step 3: Deploy Built Files

1. **Install Azure Static Web Apps CLI**
   ```bash
   npm install -g @azure/static-web-apps-cli
   ```

2. **Deploy to Azure**
   ```bash
   swa deploy ./dist --deployment-token <your-deployment-token>
   ```
   
   Get deployment token from:
   - Azure Portal → Your Static Web App → Overview → Manage deployment token

---

### Option 2: Deploy to Azure App Service (Full Stack)

#### Step 1: Create Azure App Service

1. **Login to Azure Portal**
   - Go to https://portal.azure.com

2. **Create Web App**
   - Click "Create a resource"
   - Search for "Web App"
   - Click "Create"

3. **Configure Web App**
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new or select existing
   - **Name**: `hrsa-compliance-app` (must be globally unique)
   - **Publish**: Code
   - **Runtime stack**: Node 18 LTS
   - **Operating System**: Linux
   - **Region**: East US (or your preferred region)
   - **App Service Plan**: Create new or select existing

4. **Review and Create**
   - Click "Review + create"
   - Click "Create"

#### Step 2: Configure Application Settings

1. **Go to Your Web App**
   - Navigate to your newly created Web App

2. **Add Application Settings**
   - Go to "Configuration" → "Application settings"
   - Click "New application setting" for each:
   
   ```
   VITE_AZURE_DOC_ENDPOINT = https://eastus.api.cognitive.microsoft.com/
   VITE_AZURE_DOC_KEY = your_document_intelligence_key
   VITE_AZURE_OPENAI_ENDPOINT = https://dmiai.openai.azure.com/
   VITE_AZURE_OPENAI_KEY = your_openai_key
   VITE_AZURE_OPENAI_DEPLOYMENT = gpt-4
   PORT = 8080
   ```

3. **Save Configuration**
   - Click "Save" at the top

#### Step 3: Deploy via Azure CLI

1. **Install Azure CLI**
   - Download from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

2. **Login to Azure**
   ```bash
   az login
   ```

3. **Build Application**
   ```bash
   npm run build
   ```

4. **Create Deployment Package**
   ```bash
   # Create a deployment folder
   mkdir deploy
   
   # Copy built frontend
   cp -r dist deploy/
   
   # Copy backend files
   cp server.js deploy/
   cp package.json deploy/
   cp -r data deploy/
   
   # Create startup script
   echo "node server.js" > deploy/startup.sh
   ```

5. **Deploy to Azure**
   ```bash
   az webapp up --name hrsa-compliance-app --resource-group YourResourceGroup --runtime "NODE:18-lts"
   ```

#### Step 4: Deploy via GitHub Actions (Recommended)

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/hrsa-compliance-react.git
   git push -u origin main
   ```

2. **Set Up Deployment Center**
   - In Azure Portal, go to your Web App
   - Click "Deployment Center"
   - Select "GitHub" as source
   - Authorize and select your repository
   - Select branch: `main`
   - Azure will automatically create a GitHub Actions workflow

3. **Configure Secrets in GitHub**
   - Go to your GitHub repository
   - Settings → Secrets and variables → Actions
   - Add secrets:
     - `AZURE_WEBAPP_PUBLISH_PROFILE` (download from Azure Portal)
     - `VITE_AZURE_DOC_KEY`
     - `VITE_AZURE_OPENAI_KEY`

4. **GitHub Actions Workflow**
   
   Create `.github/workflows/azure-deploy.yml`:
   ```yaml
   name: Deploy to Azure Web App

   on:
     push:
       branches:
         - main
     workflow_dispatch:

   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest

       steps:
       - uses: actions/checkout@v3

       - name: Set up Node.js
         uses: actions/setup-node@v3
         with:
           node-version: '18'

       - name: Install dependencies
         run: npm install

       - name: Build application
         run: npm run build
         env:
           VITE_AZURE_DOC_ENDPOINT: ${{ secrets.VITE_AZURE_DOC_ENDPOINT }}
           VITE_AZURE_DOC_KEY: ${{ secrets.VITE_AZURE_DOC_KEY }}
           VITE_AZURE_OPENAI_ENDPOINT: ${{ secrets.VITE_AZURE_OPENAI_ENDPOINT }}
           VITE_AZURE_OPENAI_KEY: ${{ secrets.VITE_AZURE_OPENAI_KEY }}
           VITE_AZURE_OPENAI_DEPLOYMENT: gpt-4

       - name: Deploy to Azure Web App
         uses: azure/webapps-deploy@v2
         with:
           app-name: 'hrsa-compliance-app'
           publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
           package: .
   ```

---

## 🔧 Post-Deployment Configuration

### Configure CORS (if needed)

1. Go to your Azure Web App
2. Navigate to "CORS"
3. Add allowed origins:
   - `https://your-frontend-domain.azurestaticapps.net`
   - `http://localhost:5173` (for local development)

### Enable Application Insights (Optional)

1. Go to your Web App
2. Click "Application Insights"
3. Click "Turn on Application Insights"
4. Configure monitoring settings

### Set Up Custom Domain (Optional)

1. Go to "Custom domains"
2. Click "Add custom domain"
3. Follow the verification steps
4. Configure SSL certificate

---

## 📊 Monitoring and Logs

### View Application Logs

1. **Azure Portal**
   - Go to your Web App
   - Click "Log stream"
   - View real-time logs

2. **Azure CLI**
   ```bash
   az webapp log tail --name hrsa-compliance-app --resource-group YourResourceGroup
   ```

### Download Logs

```bash
az webapp log download --name hrsa-compliance-app --resource-group YourResourceGroup
```

---

## 🚀 Scaling and Performance

### Scale Up (Vertical Scaling)

1. Go to "Scale up (App Service plan)"
2. Select a higher tier for more resources

### Scale Out (Horizontal Scaling)

1. Go to "Scale out (App Service plan)"
2. Configure auto-scaling rules or manual instance count

---

## 🔐 Security Best Practices

1. **Use Azure Key Vault** for storing API keys
2. **Enable HTTPS only** in Web App settings
3. **Configure authentication** if needed (Azure AD)
4. **Set up IP restrictions** for admin access
5. **Enable managed identity** for Azure resource access
6. **Regular security updates** - keep dependencies updated

---

## 📝 Troubleshooting

### Common Issues

1. **Build Fails**
   - Check Node.js version compatibility
   - Verify all dependencies are installed
   - Check environment variables are set correctly

2. **Application Won't Start**
   - Check application logs in Azure Portal
   - Verify PORT environment variable is set
   - Check startup command in Configuration

3. **API Calls Failing**
   - Verify Azure credentials are correct
   - Check CORS settings
   - Verify backend URL in frontend configuration

### Get Help

- Azure Support: https://azure.microsoft.com/support/
- Azure Documentation: https://docs.microsoft.com/azure/

---

## 📞 Support

For issues specific to this application:
- Check application logs
- Review Azure diagnostics
- Contact your Azure administrator

---

**Last Updated**: January 23, 2026
