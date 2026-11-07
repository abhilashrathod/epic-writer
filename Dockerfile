# Builds web and worker in one image. Run with `web` or `worker` as the command.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
CMD ["web"]
