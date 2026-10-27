FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node","server.mjs"]
