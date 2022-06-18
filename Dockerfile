# Build
FROM node:slim AS build

WORKDIR /app

COPY src/ /app

ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt -y install python3 make gcc g++
RUN npm install

# Final image
FROM node:slim

WORKDIR /app

COPY --from=build /app /app

CMD ["node", "rfxcom2mqtt.js"]