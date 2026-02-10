# Azure Portal Authentication Setup (No Code Changes)

## 🔐 Easy Authentication with Azure App Service

This guide shows how to enable authentication **entirely through Azure Portal** with **zero code changes**.

---

## ✅ What You'll Get

- ✅ Azure AD login for internal users
- ✅ External user access (B2B guests)
- ✅ Automatic authentication enforcement
- ✅ User management through Azure Portal
- ✅ No code changes required

---

## 📋 Part 1: Enable Authentication in Azure App Service

### Step 1: Go to Your Web App

1. Login to **Azure Portal** (https://portal.azure.com)
2. Navigate to your Web App: `hrsa-compliance-app`
3. In the left menu, find **"Authentication"** under Settings

### Step 2: Add Identity Provider

1. Click **"Add identity provider"**

2. **Select Identity Provider**: `Microsoft`

3. **Configure Settings**:

   **App registration**:
   - Select: `Create new app registration`
   - **Name**: `HRSA-Compliance-Auth`
   - **Supported account types**: 
     - Choose: `Current tenant - Single tenant`
     - *(This allows your organization's users + invited guests)*

   **App Service authentication settings**:
   - **Restrict access**: `Require authentication`
   - **Unauthenticated requests**: `HTTP 302 Found redirect: recommended for websites`
   - **Token store**: ✅ Enabled (checked)

4. Click **"Add"**

5. **Done!** Authentication is now enabled.

---

## 👥 Part 2: Add Internal Users (Azure AD Users)

### For Users Already in Your Azure AD

**No action needed!** They can login automatically with their work credentials.

### To Check Who Has Access

1. Go to **Azure Active Directory** (or Microsoft Entra ID)
2. Click **"Users"**
3. All users in your directory can access the app

---

## 🌐 Part 3: Invite External Users (B2B Guests)

### Step 1: Invite External User

1. Go to **Azure Active Directory** (Microsoft Entra ID)
2. Click **"Users"** in left menu
3. Click **"+ New user"** → **"Invite external user"**

4. **Fill in details**:
   - **Email**: `external.user@partner-company.com`
   - **Display name**: `John Doe`
   - **Personal message**: (Optional) "You've been invited to access HRSA Compliance Application"
   - **Groups**: (Optional) Add to specific groups
   - **Roles**: (Optional) Assign directory roles

5. Click **"Invite"**

6. **External user receives email** with invitation link
7. They click link, accept invitation, and can now login

### Step 2: Verify External User Access

1. External user goes to your app URL
2. They login with their email
3. First time: They accept consent
4. They're in!

---

## 🎯 Part 4: Assign Roles and Permissions (Optional)

### Option A: Using App Roles (Recommended)

1. **Define App Roles**:
   - Go to your **App Registration** (created in Step 2)
   - Click **"App roles"**
   - Click **"+ Create app role"**
   
   **Example Roles**:
   
   **Admin Role**:
   - **Display name**: `Admin`
   - **Allowed member types**: `Users/Groups`
   - **Value**: `Admin`
   - **Description**: `Full access to all features`
   - Click **"Apply"**
   
   **Reviewer Role**:
   - **Display name**: `Reviewer`
   - **Allowed member types**: `Users/Groups`
   - **Value**: `Reviewer`
   - **Description**: `Can view and review applications`
   - Click **"Apply"**

2. **Assign Roles to Users**:
   - Go to **Azure Active Directory**
   - Click **"Enterprise applications"**
   - Find your app: `HRSA-Compliance-Auth`
   - Click **"Users and groups"**
   - Click **"+ Add user/group"**
   - Select user and assign role
   - Click **"Assign"**

### Option B: Using Azure AD Groups

1. **Create Groups**:
   - Go to **Azure Active Directory**
   - Click **"Groups"**
   - Click **"+ New group"**
   - **Group type**: `Security`
   - **Group name**: `HRSA-Admins` or `HRSA-Reviewers`
   - **Members**: Add users
   - Click **"Create"**

2. **Grant Group Access**:
   - Go to your **Web App**
   - Click **"Authentication"**
   - Click on your identity provider
   - Under **"Permissions"**, you can configure group-based access

---

## 🔍 Part 5: View Who's Logged In

### Check Sign-in Logs

1. Go to **Azure Active Directory**
2. Click **"Sign-in logs"** (under Monitoring)
3. Filter by your application name
4. See all login attempts and successful logins

### Check Current Users

1. Go to **Azure Active Directory**
2. Click **"Enterprise applications"**
3. Find your app: `HRSA-Compliance-Auth`
4. Click **"Users and groups"**
5. See all assigned users

---

## ⚙️ Part 6: Advanced Configuration (Optional)

### Customize Login Page

1. Go to your **Web App**
2. Click **"Authentication"**
3. Click on your Microsoft identity provider
4. You can customize:
   - Login parameters
   - Token refresh settings
   - Allowed token audiences

### Session Timeout

1. In **Authentication** settings
2. Configure **"Session timeout"**
3. Set idle timeout (default: 8 hours)

### Multi-Factor Authentication (MFA)

1. Go to **Azure Active Directory**
2. Click **"Security"**
3. Click **"Conditional Access"**
4. Create policy requiring MFA for your app
5. Apply to specific users or all users

---

## 📊 Part 7: User Management Workflows

### Add New Internal User

1. **Azure AD** → **Users** → **+ New user**
2. Create user with work email
3. User can immediately access app

### Add New External User

1. **Azure AD** → **Users** → **+ New user** → **Invite external user**
2. Enter their email
3. They receive invitation
4. They accept and can login

### Remove User Access

1. **Azure AD** → **Enterprise applications** → Your app
2. **Users and groups**
3. Select user → **Remove**

### Change User Role

1. **Azure AD** → **Enterprise applications** → Your app
2. **Users and groups**
3. Select user → **Edit assignment**
4. Change role → **Save**

---

## 🛡️ Part 8: Security Best Practices

### Enable These Settings

1. **Require MFA** for all users
   - Azure AD → Security → Conditional Access

2. **Enable sign-in risk detection**
   - Azure AD → Security → Identity Protection

3. **Review sign-in logs regularly**
   - Azure AD → Sign-in logs

4. **Set up alerts**
   - Azure AD → Diagnostic settings
   - Send logs to Log Analytics

5. **Regular access reviews**
   - Azure AD → Access reviews
   - Review who has access quarterly

---

## 🧪 Testing Authentication

### Test Internal User

1. Open browser in incognito/private mode
2. Go to your app URL
3. Should redirect to Microsoft login
4. Login with work credentials
5. Should access app successfully

### Test External User

1. Invite external user (as shown above)
2. External user clicks invitation link
3. They accept consent
4. They can login with their email
5. Should access app successfully

### Test Unauthorized User

1. Try to access app without login
2. Should redirect to login page
3. Cannot access app without authentication

---

## 📝 Summary Checklist

After setup, verify:

- [ ] Authentication is enabled on Web App
- [ ] Internal users can login with work credentials
- [ ] External users can be invited and login
- [ ] Unauthorized users cannot access app
- [ ] Sign-in logs show successful logins
- [ ] Users are assigned appropriate roles
- [ ] MFA is enabled (optional but recommended)

---

## 🆘 Troubleshooting

### Users Can't Login

**Check**:
- User is added to Azure AD (internal) or invited (external)
- User accepted invitation (external users)
- Authentication is enabled on Web App
- Redirect URIs are correct

### External User Invitation Not Received

**Check**:
- Email address is correct
- Check spam/junk folder
- Resend invitation from Azure Portal

### User Has Access But Gets "Forbidden"

**Check**:
- User is assigned to the application
- User has correct role assigned
- App registration permissions are granted

---

## 💡 Key Points

✅ **No code changes needed** - Everything done in Azure Portal
✅ **Works immediately** - Changes take effect instantly
✅ **Secure by default** - Azure AD handles all authentication
✅ **Easy user management** - Add/remove users in portal
✅ **Supports B2B** - External users work seamlessly

---

## 📞 Support

- Azure AD Documentation: https://docs.microsoft.com/azure/active-directory/
- App Service Authentication: https://docs.microsoft.com/azure/app-service/overview-authentication-authorization

---

**Created**: January 23, 2026
