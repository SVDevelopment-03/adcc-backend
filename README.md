# ADCC Backend API

Abu Dhabi Cycling Club - Backend API (Node.js + Express + TypeScript + MongoDB)

## Prerequisites

- Node.js v18+ 
- MongoDB v6+
- npm v9+

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create `.env` file:

```env
NODE_ENV=development
PORT=3000
API_VERSION=v1
MONGODB_URI=mongodb://localhost:27017/adcc
JWT_SECRET=your-secret-key
```

### 3. Run

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

Server runs on `http://localhost:3000`

## Scripts

- `npm run dev` - Start dev server (auto-reload)
- `npm run build` - Compile TypeScript
- `npm start` - Start production server
- `npm run format` - Format code

## Tech Stack

- **Express** ^5.2.1
- **Mongoose** ^9.0.1
- **TypeScript** ^5.9.3
- **Zod** ^4.2.1 (Validation)
- **MongoDB** ^7.0.0

## Project Structure

```
src/
├── controllers/    # Business logic
├── models/        # MongoDB schemas
├── routes/        # API routes
├── middleware/    # Custom middleware
├── utils/         # Utilities
├── validators/    # Zod schemas
└── server.ts      # Entry point
```

## API Endpoints

- `GET /health` - Health check

## License

ISC

