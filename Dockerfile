FROM node:16
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY . .
RUN npm install
RUN npm run build
RUN rm -rf config 
CMD ["node", "src/main.js"]