const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.tokens = new Map();
    this.SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    this.startCleanupInterval();
  }

  createSession() {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: {}
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  generateToken(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.set(token, {
      sessionId,
      createdAt: new Date()
    });

    session.token = token;
    return token;
  }

  validateToken(token) {
    return this.tokens.has(token);
  }

  getSessionIdFromToken(token) {
    const tokenData = this.tokens.get(token);
    if (!tokenData) {
      throw new Error('Invalid token');
    }
    return tokenData.sessionId;
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.token) {
      this.tokens.delete(session.token);
    }
    this.sessions.delete(sessionId);
  }

  startCleanupInterval() {
    setInterval(() => {
      const now = new Date();
      const sessionsToDelete = [];

      for (const [sessionId, session] of this.sessions) {
        const timeSinceLastActivity = now - session.lastActivity;
        if (timeSinceLastActivity > this.SESSION_TIMEOUT) {
          sessionsToDelete.push(sessionId);
        }
      }

      for (const sessionId of sessionsToDelete) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        this.closeSession(sessionId);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }
}

module.exports = SessionManager;
