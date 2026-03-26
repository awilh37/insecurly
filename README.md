# Insecurly - Web Proxy

A web-based proxy application that allows you to browse websites through a server-hosted headless browser. Visit a website by entering its URL, and interact with it through your browser's interface.

## Project Structure

- **Frontend**: GitHub Pages hosted at `awilh37.github.io/insecurly` (this repo)
  - Single-page application with no build required
  - Connects to backend server via WebSocket
  - Real-time screenshot updates and interaction
  
- **Backend**: Separate Node.js/Express server
  - Repository: `insecurly-server`
  - Runs headless browser instances using Puppeteer
  - Manages user sessions and authentication
  - Handles page interactions and screenshots

## How It Works

1. **User** visits `awilh37.github.io/insecurly`
2. **Frontend** connects to the backend server via Socket.io WebSocket
3. **User** enters a website URL (e.g., "google.com")
4. **Backend** creates a headless browser instance and navigates to the URL
5. **Backend** takes a screenshot and sends it back to the frontend
6. **User** can interact with the page:
   - Click at specific coordinates
   - Type text
   - Scroll
   - Navigate back/forward
   - Enter new URLs
7. **Backend** updates the screenshot after each interaction

## Features

✅ Real-time website viewing via proxy  
✅ Point-and-click interaction  
✅ Text input and navigation  
✅ Browser history (back/forward)  
✅ Session-based authentication  
✅ WebSocket real-time communication  
✅ Responsive UI design  
✅ Error handling and status indicators  

## Getting Started

### Running Locally

To test locally, you'll need to:

1. **Clone/setup the server** (from `insecurly-server` repo):
   ```bash
   cd ../insecurly-server
   npm install
   npm start
   ```
   Server runs on `http://localhost:3002`

2. **Serve the frontend** locally:
   ```bash
   cd ../insecurly
   python3 -m http.server 8000
   # or
   npx http-server
   ```
   Frontend runs on `http://localhost:8000`

3. **Update the frontend** to connect to local server:
   - Edit `index.html`, find `SERVER_URL` variable
   - Change to `http://localhost:3002` for local testing

### Production Deployment

- **Frontend**: Automatically deployed via GitHub Pages when pushed to `main` branch
- **Backend**: Deploy `insecurly-server` to your preferred host:
  - Heroku
  - DigitalOcean
  - AWS
  - Render
  - Or self-hosted server

Update `FRONTEND_URL` in the server's `.env` file to match your production frontend URL.

## Configuration

### Frontend

- `SERVER_URL`: Set in `index.html` - change for different backend servers

### Backend

See `insecurly-server` README for configuration:
- `PORT`: Server port (default: 3002)
- `FRONTEND_URL`: Allowed origin for CORS
- `NODE_ENV`: development or production

## Technology Stack

**Frontend**:
- HTML5
- CSS3 with responsive design
- Vanilla JavaScript
- Socket.io client for WebSocket communication

**Backend**:
- Node.js
- Express.js
- Socket.io
- Puppeteer (headless browser automation)

## Security Considerations

⚠️ **Important**: This project is meant for educational and testing purposes.

- No SSL/TLS enforcement in demo config (add in production)
- Simple token-based auth (upgrade for production)
- No rate limiting (add for public deployment)
- All websites are accessible - consider adding a whitelist
- Sessions timeout after 30 minutes

For production use, implement:
- HTTPS/TLS encryption
- Stronger authentication (OAuth, multi-factor)
- Rate limiting and DDoS protection
- Input validation and sanitization
- Website whitelist/blacklist
- Resource limits on browser instances

## Troubleshooting

**"Cannot connect to server"**
- Ensure backend server is running
- Check `SERVER_URL` in `index.html` matches your backend
- Verify CORS is configured correctly

**"Browser took too long to load"**
- Some websites may have strict security headers
- Check browser console for specific errors
- May need to add User-Agent headers or other browser config

**"Screenshot not updating"**
- Check network tab for Socket.io connection status
- Verify backend is responding to screenshot requests
- Check backend logs for errors

## License

ISC

## Author

Created with ❤️ by awilh37
