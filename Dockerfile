# The Probe Station (semiconductor-explorer), served under /probe by the same
# Caddy that fronts AVSAR — same reasoning as /news: one origin, so no second
# certificate and no CSP widening.
#
# IT HOLDS A GROQ KEY. `src/app/api/tutor/route.ts` calls Groq server-side with
# GROQ_API_KEY. That key is read from the container environment and never
# reaches the browser: the route runs on the Node server, not in the bundle. Do
# not move that call client-side, and do not add the key to any NEXT_PUBLIC_*
# variable — that prefix is what inlines a value into the JavaScript the learner
# downloads.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# `output: "standalone"` emits a self-contained server plus the trimmed
# node_modules it needs; static assets and public/ are copied alongside it.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
