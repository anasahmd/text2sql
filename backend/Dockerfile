FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Remove dev/seed files from production image
RUN rm -f seed-postgres.js

EXPOSE 5000

CMD ["node", "server.js"]
