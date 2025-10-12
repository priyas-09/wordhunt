# Dockerfile for React client
FROM node:20

WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install all dependencies including dev deps (Tailwind, PostCSS, Autoprefixer)
RUN npm install

# Copy the rest of the app
COPY . .

# Expose React dev server port
EXPOSE 3000

CMD ["npm", "start"]