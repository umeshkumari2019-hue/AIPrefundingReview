# Quick Deployment Guide - Azure VM

## 🚀 Fast Setup (5 Minutes)

### 1. Install PM2
```bash
npm install -g pm2
npm install dotenv
```

### 2. Update Configuration

**Edit `.env.production`** - Replace `YOUR_VM_IP` with your Azure VM IP:
```
VITE_BACKEND_URL=http://YOUR_VM_IP:3001
```

**Edit `.env.server`** - Replace `YOUR_VM_IP` with your Azure VM IP:
```
ALLOWED_ORIGINS=http://YOUR_VM_IP:3000,http://YOUR_VM_IP:5173
```

### 3. Build & Deploy
```bash
npm install
npm run build
pm2 start ecosystem.config.js
pm2 save
```

### 4. Configure Azure Firewall

**Azure Portal:**
- VM → Networking → Add inbound port rules
- Allow ports: **3000** (Frontend), **3001** (Backend)

### 5. Access Application

**Share this URL with users:**
```
http://YOUR_VM_IP:3000
```

## ✅ Verify Deployment

```bash
pm2 status          # Check if apps are running
pm2 logs            # View application logs
```

## 🔄 Update Application

```bash
git pull            # Get latest code
npm install         # Update dependencies
npm run build       # Rebuild frontend
pm2 restart all     # Restart services
```

## 📊 Monitor

```bash
pm2 monit           # Real-time monitoring
pm2 logs hrsa-frontend
pm2 logs hrsa-backend
```

## 🛑 Stop Application

```bash
pm2 stop all
```

## 🔧 Troubleshooting

**Can't access from browser?**
- Check Azure NSG allows ports 3000, 3001
- Verify VM IP is correct
- Check PM2 status: `pm2 status`

**Backend errors?**
- Check logs: `pm2 logs hrsa-backend`
- Verify Azure credentials in `.env.production`

**Need help?** Check full guide: `deploy.md`
