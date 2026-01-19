# HRSA Compliance Tool - Azure VM Deployment Guide

## Prerequisites
- Azure VM with Windows Server or Ubuntu
- Node.js 18+ installed
- PM2 installed globally: `npm install -g pm2`
- Git installed (optional, for code updates)

## Deployment Steps

### 1. Prepare the Application

```bash
# Navigate to project directory
cd Y:\Umesh\hrsa-compliance-react

# Install dependencies
npm install

# Build frontend for production
npm run build
```

### 2. Update Configuration

**Edit `.env.production`:**
- Replace `YOUR_VM_IP` with your Azure VM's public IP address
- Example: `VITE_BACKEND_URL=http://20.185.123.45:3001`

**Edit `.env.server`:**
- Replace `YOUR_VM_IP` with your Azure VM's public IP address
- Example: `ALLOWED_ORIGINS=http://20.185.123.45:3000`

### 3. Configure Firewall (Azure VM)

**In Azure Portal:**
1. Go to your VM → Networking → Inbound port rules
2. Add rules to allow:
   - Port 3000 (Frontend)
   - Port 3001 (Backend API)
   - Port 80 (HTTP - optional, for nginx)
   - Port 443 (HTTPS - optional, for SSL)

**On Windows VM:**
```powershell
New-NetFirewallRule -DisplayName "HRSA Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "HRSA Backend" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

**On Linux VM:**
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw reload
```

### 4. Start Application with PM2

```bash
# Create logs directory
mkdir logs

# Start both frontend and backend
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the command it outputs
```

### 5. Access the Application

**Frontend URL:** `http://YOUR_VM_IP:3000`
**Backend API:** `http://YOUR_VM_IP:3001`

Share the frontend URL with your users.

## Optional: Setup Nginx Reverse Proxy

For cleaner URLs without port numbers:

### Install Nginx

**Windows:**
Download from: https://nginx.org/en/download.html

**Linux:**
```bash
sudo apt update
sudo apt install nginx
```

### Configure Nginx

Create `/etc/nginx/sites-available/hrsa-compliance` (Linux) or edit `nginx.conf` (Windows):

```nginx
server {
    listen 80;
    server_name YOUR_VM_IP_OR_DOMAIN;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable and restart Nginx (Linux):**
```bash
sudo ln -s /etc/nginx/sites-available/hrsa-compliance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**With Nginx, users access:** `http://YOUR_VM_IP`

## Management Commands

```bash
# View application status
pm2 status

# Restart applications
pm2 restart all

# Stop applications
pm2 stop all

# View logs
pm2 logs hrsa-frontend
pm2 logs hrsa-backend

# Monitor resources
pm2 monit
```

## Updating the Application

```bash
# Stop applications
pm2 stop all

# Pull latest code (if using Git)
git pull

# Install dependencies
npm install

# Rebuild frontend
npm run build

# Restart applications
pm2 restart all
```

## Troubleshooting

### Application won't start
- Check logs: `pm2 logs`
- Verify ports are not in use: `netstat -ano | findstr :3000`
- Check firewall rules

### Can't access from browser
- Verify Azure Network Security Group allows ports 3000, 3001
- Check Windows Firewall or Linux ufw rules
- Ensure VM public IP is correct

### Backend API errors
- Check `.env.server` configuration
- Verify data directory exists and has write permissions
- Check Azure service credentials are correct

## Security Recommendations

1. **Use HTTPS** - Set up SSL certificate with Let's Encrypt
2. **Environment Variables** - Never commit `.env` files to Git
3. **Firewall** - Only open necessary ports
4. **Authentication** - Add user authentication if needed
5. **Regular Updates** - Keep Node.js and dependencies updated

## Support

For issues, check:
- PM2 logs: `pm2 logs`
- Browser console (F12)
- Network tab for API errors
