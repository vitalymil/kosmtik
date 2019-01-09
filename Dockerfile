FROM ubuntu:18.04
RUN apt-get clean
RUN apt-get update

RUN apt-get install -y curl gnupg
RUN curl -L https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs
RUN apt-get install -y make g++
RUN apt-get install -y fonts-noto-cjk fonts-noto-hinted fonts-noto-unhinted fonts-hanazono ttf-unifont

COPY ./package.json /kosmtik/package.json
COPY ./package-lock.json /kosmtik/package-lock.json
WORKDIR /kosmtik
RUN npm install
COPY . .
RUN mkdir projects

CMD ["node", "index.js", "serve", "projects", "--host", "0.0.0.0"]