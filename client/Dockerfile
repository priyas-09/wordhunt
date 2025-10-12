# Dockerfile for React client
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy only package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose React dev server port
EXPOSE 3000

# Start the React development server
CMD ["npm", "start"]