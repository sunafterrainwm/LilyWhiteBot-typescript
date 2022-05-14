FROM node:16
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY . .
RUN npm ci
RUN npm run lint
RUN npm run initial && npm run build
RUN npm ci --omit=dev
RUN rm -rf config Gruntfile.js scripts tsconfig.json typings .eslintrc.json
CMD ["node", "src/main.js"]
