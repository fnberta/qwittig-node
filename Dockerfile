FROM fnberta/opencv-python3

RUN apt-get update -y && apt-get install --no-install-recommends -y -q  \
    curl \
    python3-pip \
    python3-setuptools

RUN pip3 install --upgrade pip
RUN pip3 install \
    numpy \
    scipy \
    scikit-image \
    imutils

## Install Node.js
RUN curl -sL https://deb.nodesource.com/setup_7.x | bash -
RUN apt-get update -y && apt-get install -y -q \
    nodejs

WORKDIR /opt/node
COPY package.json /opt/node/
COPY build /opt/node/build/
COPY cert /opt/node/cert/
COPY bin /opt/node/bin/

ENV NODE_ENV production
RUN npm install --quiet --production

## Start node.js app on port 8080
ENV PORT 8080
EXPOSE 8080
CMD [ "npm", "start" ]


