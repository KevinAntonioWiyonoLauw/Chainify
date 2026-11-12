# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS base
WORKDIR /app
RUN apk add --no-cache ca-certificates
ENV CGO_ENABLED=0

FROM base AS dev
COPY . .
EXPOSE 8080
CMD ["go", "run", "./cmd/server"]

FROM base AS builder
COPY . .
# The module currently has no external dependencies; no module download step is needed.
RUN go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.21 AS prod
RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app
WORKDIR /app
COPY --from=builder /out/server /usr/local/bin/chainify-api
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/chainify-api"]
