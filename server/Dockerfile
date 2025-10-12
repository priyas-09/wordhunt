FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install express cors pg dotenv
COPY . .
CMD ["node", "index.js"]