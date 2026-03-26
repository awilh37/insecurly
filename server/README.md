# Insecurly Server

A Node.js backend server for the Insecurly web proxy project. Uses Puppeteer to control headless browsers and Socket.io for real-time communication with the frontend.

## Setup

```bash
npm install
npm start
```

The server will run on `http://localhost:5000` by default.

## Environment Variables

Create a `.env` file in the root directory:

```
PORT=5000
NODE_ENV=development
FRONTEND_URL=https://awilh37.github.io
```

## Architecture

- **server.js**: Main Express/Socket.io server with event handlers
- **browserManager.js**: Manages Puppeteer browser instances and page interactions
- **sessionManager.js**: Handles user sessions and token authentication

## API Events (Socket.io)

### Client → Server

- `authenticate`: Authenticate with a token
- `launch-browser`: Launch a new browser session for a URL
- `navigate`: Navigate to a new URL
- `click`: Click at coordinates (x, y)
- `type`: Type text into the page
- `scroll`: Scroll by (x, y) pixels
- `back`: Navigate back in history
- `forward`: Navigate forward in history
- `screenshot`: Request a screenshot
- `close-browser`: Close the current browser

### Server → Client

- `authenticated`: Authentication successful
- `browser-launched`: Browser created and ready
- `screenshot`: Screenshot image (base64)
- `error`: Error occurred
- `navigated`, `clicked`, `typed`, `scrolled`: Operation complete

## REST Endpoints

- `GET /health`: Server health check
- `POST /auth/register`: Create a new session and get a token

## Features

- Headless browser control via Puppeteer
- Real-time WebSocket communication
- Session-based authentication
- Automatic session cleanup
- CORS support for GitHub Pages
- Screenshot capture
- Navigation history support
