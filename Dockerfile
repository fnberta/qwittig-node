FROM ubuntu:16.04

RUN apt-get update -y && apt-get install --no-install-recommends -y -q  \
    curl \
    git \
    wget \
    unzip \
    python \
    ca-certificates \
    build-essential \
    cmake \
    pkg-config \
    libjpeg-dev \
    libtiff-dev \
    libjasper-dev \
    libpng-dev \
    python-dev \
    python-numpy \
    python-skimage \
    tesseract-ocr

## Install OpenCV
WORKDIR /tmp/opencv
RUN wget https://github.com/Itseez/opencv/archive/3.1.0.zip
RUN unzip 3.1.0.zip

WORKDIR /tmp/opencv/opencv-3.1.0/build
RUN cmake ..
RUN make && make install && make clean

RUN sh -c 'echo "/usr/local/lib" > /etc/ld.so.conf.d/opencv.conf'
RUN ldconfig

## Install Node.js
RUN curl -sL https://deb.nodesource.com/setup_6.x | bash -
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


