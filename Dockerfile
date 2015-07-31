FROM google/debian:wheezy

RUN apt-get update -y && apt-get install --no-install-recommends -y -q  \
curl \
python \ 
build-essential \ 
git \ 
ca-certificates
RUN curl --silent --location https://deb.nodesource.com/setup_0.12 | bash -
RUN apt-get install --yes nodejs

WORKDIR /app
ONBUILD ADD package.json /app/
ONBUILD RUN npm install
ONBUILD ADD . /app

EXPOSE 8080
CMD [ "npm", "start" ]






