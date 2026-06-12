# Stage 1: Build virtual environment using a Debian glibc variant to support PyTorch/ML wheels
FROM ghcr.io/astral-sh/uv:python3.14-bookworm AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app

# Provision dependencies cleanly using your existing uv.lock config
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev --python 3.14

# Import the source directory tree to finalize environment linking tasks
COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --python 3.14

# Stage 2: Clean runtime stage using official Python 3.14 glibc image core
FROM python:3.14-slim

WORKDIR /app

# Extract compiled binary environments securely from builder stage
COPY --from=builder /app/.venv /app/.venv
COPY . /app

# Push the virtual environment paths straight into system execution priority
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Fire up uvicorn mapped directly across all network interfaces inside the image boundary
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]