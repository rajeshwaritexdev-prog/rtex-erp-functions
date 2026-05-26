# RTEX ERP Functions

A serverless Express.js application for RTEX ERP backend, deployed on AWS Lambda with MongoDB integration.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Project Setup](#project-setup)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Deployment to AWS Lambda](#deployment-to-aws-lambda)

## Prerequisites

Before setting up this project, ensure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **AWS Account** with appropriate permissions for Lambda
- **MongoDB Atlas** account (or MongoDB URI) - [Sign up here](https://www.mongodb.com/cloud/atlas)
- **Git** for version control

Verify your Node.js installation:
```bash
node --version
npm --version
```

## Project Setup

### 1. Clone the Repository

```bash
git clone https://github.com/rajeshwaritexdev-prog/rtex-erp-functions.git
cd rtex-erp-functions
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages:
- **express** - Web framework
- **serverless-http** - Adapter for AWS Lambda
- **mongodb** - MongoDB client
- **dotenv** - Environment variable management
- **cors** - Cross-Origin Resource Sharing middleware

## Environment Configuration

### 1. Create `.env` File

Create a `.env` file in the project root:

```bash
touch .env
```

### 2. Add Environment Variables

Add the following to your `.env` file:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/<database-name>?retryWrites=true&w=majority
NODE_ENV=development
PORT=9000
```

**Important:**
- Replace `<username>`, `<password>`, `<cluster-name>`, and `<database-name>` with your actual MongoDB Atlas credentials
- Keep your `.env` file secret and never commit it to version control
- The `.gitignore` file should already exclude `.env`
- `PORT` is configurable via the `.env` file (default: 9000)

## Local Development

### Start Local Server

```bash
node index.js
```

The server will run on `http://localhost:9000` (as configured in your `.env` file).

Or use `nodemon` for automatic restart on file changes:

```bash
npm install -D nodemon
npx nodemon index.js
```

### Test the API

**Health Check Endpoint:**
```bash
curl http://localhost:9000/api/health
```

Expected response:
```json
{
  "status": "Backend is fully operational and ready to serve requests"
}
```

**Test Database Connection:**
```bash
curl http://localhost:9000/api/test
```

This will return up to 10 documents from the `test` collection in MongoDB.

## Deployment to AWS Lambda

### Development Deployment

Push code to the `develop` branch to automatically deploy to the dev Lambda function:

```bash
git push origin develop
```

### Production Deployment

1. Create a Pull Request from `develop` to `main`:
```bash
git pull origin develop
git checkout main
git pull origin main
git merge develop
git push origin main
```

2. Once merged to `main`, the changes automatically push to the prod Lambda function.

**Note:** Code pushed to `develop` automatically deploys to the dev function, and merged code to `main` automatically deploys to the prod function.