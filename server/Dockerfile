FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install express cors pg dotenv
RUN npm install socket.io
COPY . .
CMD ["node", "index.js"]