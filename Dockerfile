# Use current Node.js version as reported by user environments
FROM node:24-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Backup file is included so auto-restore works on the first run in a fresh container
# EXPOSE the port configured in .env (default 3000)
EXPOSE 3000

# Start command
CMD [ "npm", "start" ]
