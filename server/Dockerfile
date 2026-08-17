FROM node:20-alpine AS development

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build

CMD ["npm", "run", "start:dev"]

FROM node:20-alpine AS production

RUN apk add --no-cache openssl

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY . .

# Generate Prisma client for the production image
RUN npx prisma generate

COPY --from=development /usr/src/app/dist ./dist

CMD ["node", "dist/src/main"]
