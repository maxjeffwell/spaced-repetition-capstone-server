# IntervalAI - Server

The backend API for IntervalAI, a neural-enhanced spaced repetition learning system.

## Overview

IntervalAI combines traditional SM-2 spaced repetition with a neural network that learns individual user patterns to provide personalized, optimal review intervals for maximum memory retention.

## Features

- **SM-2 Algorithm**: Traditional spaced repetition with quality-based intervals
- **Neural Network**: 8-layer deep learning model (961 parameters) for interval prediction
- **Data Collection Pipeline**: Automatic training data extraction from user review history
- **ML Training Service**: Automated model training with validation
- **Authentication & Authorization**: Passport.js with JWT tokens
- **A/B Testing Framework**: Compare algorithm performance

## Technology Stack

- Node.js with Express
- MongoDB with Mongoose
- TensorFlow.js 4.22.0 & TensorFlow.js Node 4.22.0
- Passport.js (authentication)
- JWT (JSON Web Tokens)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- npm

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the root directory with the following variables:

```
DATABASE_URL=mongodb://localhost:27017/intervalai
JWT_SECRET=your-secret-key
CLIENT_ORIGIN=http://localhost:3000
```

### Development

```bash
npm run dev
```

Starts the server with automatic restart on file changes using nodemon.

### Production

```bash
npm start
```

Starts the server at http://localhost:8080 (or the port specified in your environment).

### Testing

```bash
npm test
```

Runs the test suite using Mocha.

## API Endpoints

See the main project documentation for detailed API endpoint information.

## Deployment

The server is configured for deployment to Heroku or similar platforms. See the main project documentation for deployment instructions.
