# Security Setup

## Environment Variables

Before running the application, you **MUST** create a `.env` file with the following variables:

```bash
# Copy the example file
cp env.example .env

# Edit the .env file with your actual values
nano .env
```

### Required Environment Variables:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/wordhunt

# JWT Secret (CRITICAL - Generate a secure random string!)
JWT_SECRET=your-super-secure-jwt-secret-key-change-this-in-production

# Node Environment
NODE_ENV=development
```

## Security Notes:

1. **JWT_SECRET**: Generate a secure random string (at least 32 characters)
   ```bash
   # Generate a secure JWT secret
   openssl rand -base64 32
   ```

2. **Database Password**: Use a strong password for your PostgreSQL database

3. **Production**: Change all default values before deploying to production

## What's Protected:

- ✅ `.env` files are in `.gitignore`
- ✅ `node_modules/` are in `.gitignore`
- ✅ Database files are in `.gitignore`
- ✅ JWT secret is required from environment variables
- ✅ No hardcoded secrets in the code

## What's Safe to Push:

- ✅ Source code
- ✅ Configuration files (without secrets)
- ✅ Database migrations
- ✅ Docker files
- ✅ Package.json files
