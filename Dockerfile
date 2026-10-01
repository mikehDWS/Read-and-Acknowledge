FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY next.config.mjs ./
COPY db ./db
COPY scripts ./scripts
EXPOSE 3000
# Apply any new migrations, then start the app.
CMD ["sh", "-c", "node scripts/migrate.mjs && npx next start -p 3000"]
