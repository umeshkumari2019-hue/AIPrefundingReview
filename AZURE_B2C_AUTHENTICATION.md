# Azure AD B2C Authentication Setup (Consumer/Public Access)

## 🌐 What is Azure AD B2C?

**Azure AD B2C (Business-to-Consumer)** is for public-facing applications where you want to allow:
- ✅ Anyone to sign up with email/password
- ✅ Social logins (Google, Facebook, Microsoft, LinkedIn, etc.)
- ✅ Custom branding and user experience
- ✅ Self-service registration
- ✅ Password reset flows

## 📊 When to Use B2B vs B2C

| Feature | B2B (Business Partners) | B2C (Public/Consumers) |
|---------|------------------------|------------------------|
| **User Type** | Business partners, contractors | General public, customers |
| **Sign Up** | Invitation only | Self-service registration |
| **Login Options** | Work/school accounts | Email, social accounts |
| **Use Case** | Internal collaboration | Public applications |
| **Your Scenario** | Partner organizations | Public website users |
| **Cost** | Free | Pay per user (50K free) |

## 🎯 Which Should You Use?

### **Use B2B (Already documented)** if:
- ✅ Users are from **partner organizations**
- ✅ You want to **invite specific people**
- ✅ Users have **work/school email accounts**
- ✅ You need **enterprise security**
- ✅ **Your current scenario** - HRSA compliance review with specific reviewers

### **Use B2C** if:
- ✅ You want **public access**
- ✅ Anyone can **self-register**
- ✅ You want **social logins** (Google, Facebook)
- ✅ You need **custom branding**
- ✅ Building a **customer-facing application**

---

## 📋 Azure AD B2C Setup (If You Need Public Access)

### Part 1: Create Azure AD B2C Tenant

1. **Login to Azure Portal** (https://portal.azure.com)

2. **Create B2C Tenant**
   - Click **"Create a resource"**
   - Search for **"Azure Active Directory B2C"**
   - Click **"Create"**

3. **Choose Creation Option**
   - Select: **"Create a new Azure AD B2C Tenant"**

4. **Configure Tenant**
   - **Organization name**: `HRSA Compliance`
   - **Initial domain name**: `hrsacompliance` (must be unique)
     - Full domain: `hrsacompliance.onmicrosoft.com`
   - **Country/Region**: `United States`
   - **Subscription**: Select your subscription
   - **Resource group**: Use existing or create new

5. **Click "Review + create"** → **"Create"**
   - Takes 1-2 minutes to create

6. **Switch to B2C Tenant**
   - Click your profile icon (top right)
   - Click **"Switch directory"**
   - Select your new B2C tenant

### Part 2: Register Application in B2C

1. **In B2C Tenant**, search for **"Azure AD B2C"**

2. **Register Application**
   - Click **"App registrations"**
   - Click **"+ New registration"**
   
3. **Configure**
   - **Name**: `HRSA Compliance Web App`
   - **Supported account types**: `Accounts in any identity provider or organizational directory (for authenticating users with user flows)`
   - **Redirect URI**: 
     - Platform: `Single-page application (SPA)`
     - URI: `http://localhost:5173`
   - Click **"Register"**

4. **Copy Values**
   - ✅ **Application (client) ID**
   - ✅ **Tenant name**: `hrsacompliance.onmicrosoft.com`

### Part 3: Create User Flows

User flows define the sign-up/sign-in experience.

#### Create Sign Up and Sign In Flow

1. **In Azure AD B2C**, click **"User flows"**
2. Click **"+ New user flow"**
3. Select **"Sign up and sign in"**
4. Select version: **"Recommended"**

5. **Configure Flow**
   - **Name**: `signupsignin1`
   - **Identity providers**: 
     - ✅ Email signup
     - (Optional) Add social providers later
   
   - **Multifactor authentication**: 
     - Choose: `Optional` or `Required`
   
   - **User attributes and token claims**:
     Select what to collect during signup:
     - ✅ Email Address
     - ✅ Display Name
     - ✅ Given Name
     - ✅ Surname
     - (Optional) Job Title, Company

6. Click **"Create"**

#### Create Password Reset Flow

1. Click **"+ New user flow"**
2. Select **"Password reset"**
3. **Name**: `passwordreset1`
4. **Identity providers**: ✅ Reset password using email address
5. Click **"Create"**

#### Create Profile Editing Flow

1. Click **"+ New user flow"**
2. Select **"Profile editing"**
3. **Name**: `profileediting1`
4. **Identity providers**: ✅ Email signin
5. Click **"Create"**

### Part 4: Add Social Identity Providers (Optional)

#### Add Google Login

1. **In Azure AD B2C**, click **"Identity providers"**
2. Click **"+ Add"** → Select **"Google"**
3. **Configure**:
   - **Name**: `Google`
   - **Client ID**: (Get from Google Cloud Console)
   - **Client secret**: (Get from Google Cloud Console)
4. Click **"Save"**

#### Add Facebook Login

1. Click **"+ Add"** → Select **"Facebook"**
2. **Configure**:
   - **Name**: `Facebook`
   - **Client ID**: (Get from Facebook Developers)
   - **Client secret**: (Get from Facebook Developers)
3. Click **"Save"**

#### Add Microsoft Account

1. Click **"+ Add"** → Select **"Microsoft Account"**
2. **Configure**:
   - **Name**: `Microsoft`
   - **Client ID**: (Auto-configured)
   - **Client secret**: (Auto-configured)
3. Click **"Save"**

### Part 5: Configure Web App with B2C

#### Option A: Using Azure App Service (No Code)

1. **Go to your Web App** in Azure Portal
2. Click **"Authentication"**
3. Click **"Add identity provider"**
4. Select **"Microsoft"**
5. **Configure**:
   - **App registration type**: `Provide details of existing app registration`
   - **Application (client) ID**: (Your B2C app ID)
   - **Client secret**: (Create in B2C app)
   - **Issuer URL**: `https://hrsacompliance.b2clogin.com/hrsacompliance.onmicrosoft.com/v2.0/.well-known/openid-configuration?p=B2C_1_signupsignin1`
6. Click **"Add"**

---

## 🎨 Part 6: Customize B2C Experience

### Customize Branding

1. **In Azure AD B2C**, click **"Company branding"**
2. **Configure**:
   - Upload logo
   - Set background color
   - Add banner image
   - Customize text

### Customize User Flow Pages

1. Click **"User flows"**
2. Select your flow (e.g., `B2C_1_signupsignin1`)
3. Click **"Page layouts"**
4. Customize:
   - Sign-up page
   - Sign-in page
   - Password reset page
   - Custom HTML/CSS

---

## 👥 Part 7: User Management in B2C

### View All Users

1. **In B2C Tenant**, go to **"Users"**
2. See all registered users
3. Filter by:
   - Local accounts (email/password)
   - Social accounts (Google, Facebook, etc.)

### Manually Create User

1. Click **"+ New user"**
2. Select **"Create Azure AD B2C user"**
3. Fill in:
   - **Email**: User's email
   - **Display name**: User's name
   - **Password**: Initial password
4. Click **"Create"**

### Delete User

1. Go to **"Users"**
2. Select user
3. Click **"Delete"**

### Reset User Password

1. Go to **"Users"**
2. Select user
3. Click **"Reset password"**
4. Copy temporary password
5. Send to user

---

## 🔐 Part 8: Security and Policies

### Enable Conditional Access

1. Go to **"Security"** → **"Conditional Access"**
2. Create policies:
   - Require MFA for specific users
   - Block access from certain locations
   - Require compliant devices

### Configure Password Policies

1. Go to **"User flows"**
2. Select your flow
3. Click **"Properties"**
4. Configure:
   - Password complexity
   - Password expiration
   - Account lockout

### Enable Fraud Detection

1. Go to **"Security"** → **"Identity Protection"**
2. Enable:
   - Risk-based conditional access
   - Suspicious activity detection
   - Anomaly detection

---

## 📊 Part 9: Monitoring and Analytics

### View Sign-in Logs

1. Go to **"Monitoring"** → **"Sign-in logs"**
2. See:
   - Successful logins
   - Failed attempts
   - User locations
   - Devices used

### View Audit Logs

1. Go to **"Monitoring"** → **"Audit logs"**
2. Track:
   - User registrations
   - Password resets
   - Profile changes
   - Admin actions

### Usage Analytics

1. Go to **"Monitoring"** → **"Usage"**
2. See:
   - Monthly active users (MAU)
   - Authentication requests
   - User flow usage

---

## 💰 Part 10: Pricing

### B2C Pricing Tiers

| Tier | Monthly Active Users (MAU) | Cost |
|------|---------------------------|------|
| **Free** | Up to 50,000 | $0 |
| **Premium P1** | Per MAU | $0.00325 per MAU |
| **Premium P2** | Per MAU | $0.0132 per MAU |

**Additional Costs**:
- MFA: $0.03 per authentication
- Advanced security: Premium P2 required

### Cost Examples

- **5,000 users/month**: Free
- **100,000 users/month**: ~$162.50/month (P1)
- **500,000 users/month**: ~$1,625/month (P1)

---

## 🆚 Comparison: B2B vs B2C for Your Use Case

### **Recommended for HRSA Compliance: B2B**

**Why B2B is better for you**:
- ✅ You have **specific reviewers** (not public)
- ✅ You want **invitation-only** access
- ✅ Users are **business professionals**
- ✅ **Free** (no per-user cost)
- ✅ **Enterprise security** built-in
- ✅ **Easier management**

**When to add B2C**:
- If you want to allow **public submissions**
- If you need **self-service registration**
- If you want **social logins**
- If building a **public portal**

---

## 🔄 Can You Use Both?

**Yes!** You can use both B2B and B2C:

**Example Architecture**:
- **B2B**: For internal staff and partner reviewers
- **B2C**: For public applicants to submit applications

**Implementation**:
1. Keep your main app with B2B authentication
2. Create a separate public portal with B2C
3. Use different subdomains:
   - `review.hrsa-compliance.com` (B2B - reviewers)
   - `submit.hrsa-compliance.com` (B2C - public)

---

## 📝 Summary

### **For Your Current Scenario (HRSA Compliance Review)**

**Recommendation**: **Use B2B** (already documented)
- ✅ Simpler setup
- ✅ Free
- ✅ Better for business users
- ✅ Invitation-based access
- ✅ Enterprise security

### **Consider B2C If**:
- You want public access
- You need self-registration
- You want social logins
- You're building a customer portal

---

## 🆘 Need Help Deciding?

**Ask yourself**:
1. **Who are my users?**
   - Business partners/staff → **B2B**
   - General public/customers → **B2C**

2. **How do users get access?**
   - Invitation only → **B2B**
   - Self-registration → **B2C**

3. **What login methods?**
   - Work/school accounts → **B2B**
   - Email/social accounts → **B2C**

4. **Budget?**
   - Free → **B2B**
   - Pay per user → **B2C**

---

**Created**: January 23, 2026
