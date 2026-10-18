# One container runs the WebSocket game server and serves the built web client
# (/, /pets, /ws, /health). Used by Hugging Face Spaces (Docker SDK), which
# routes traffic to port 7860; any other Docker host works too.
FROM node:22-slim

# Spaces run the container as user 1000; give it the app directory.
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npm run build:client

ENV PORT=7860
EXPOSE 7860
CMD ["npm", "run", "server"]
