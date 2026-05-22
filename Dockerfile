# Use lightweight and secure Node.js 20 base image
FROM node:20-alpine

# Set the execution directory inside the container
WORKDIR /app

# Copy package descriptors first to optimize Docker layer caching
COPY package*.json ./

# Install only production dependencies for faster execution and smaller image footprint
RUN npm install --omit=dev

# Copy remaining source code, visual branding assets, stylesheets, and scripts
COPY server.js ./
COPY customer.html ./
COPY dashboard.html ./
COPY grand-logo.png ./
COPY css/ ./css/
COPY js/ ./js/

# Force production node environment
ENV NODE_ENV=production

# Cloud Run defaults to exposing port 8080 dynamically
ENV PORT=8080
EXPOSE 8080

# Boot the real-time server
CMD ["node", "server.js"]
