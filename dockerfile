FROM ghcr.io/astral-sh/uv:python3.14-bookworm AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev --python 3.14

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --python 3.14

FROM python:3.14-slim AS backend_runtime

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY . /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM node:20-alpine AS frontend_build

WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ .

ARG VITE_API_HOST=http://localhost:8000
ARG VITE_WS_HOST=ws://localhost:8000
ENV VITE_API_HOST=$VITE_API_HOST
ENV VITE_WS_HOST=$VITE_WS_HOST

RUN npm run build

FROM nginx:alpine AS frontend_runtime

COPY --from=frontend_build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]