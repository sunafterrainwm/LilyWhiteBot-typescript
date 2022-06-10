FROM node:16
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY . .
RUN corepack enable pnpm
RUN pnpm install
RUN pnpm run lint
RUN pnpm run initial && pnpm run build
RUN pnpm install --offline --prod
RUN rm -rf src/**/*.ts plugins/**/*.ts config Gruntfile.js scripts tsconfig.json typings .eslintrc.json
CMD ["node", "src/main.js"]
