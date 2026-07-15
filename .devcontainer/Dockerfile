FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

USER root
RUN npx --yes playwright@1.61.1 install-deps chromium
USER node
