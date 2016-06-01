FROM ubuntu:14.04

RUN \
    apt-get update -y && apt-get install --no-install-recommends -y -q  \
    curl \
    python \ 
    build-essential \ 
    ca-certificates \
    cmake \
    pkg-config \
    libjpeg8-dev \
    libtiff4-dev \
    libjasper-dev \
    libpng12-dev \
    python-dev \
    python-numpy \
    python-skimage \
    git \
    wget \
    unzip \
    tesseract-ocr \
    tesseract-ocr-deu

   
## Install OpenCV 
WORKDIR /opt/opencv
RUN wget https://github.com/Itseez/opencv/archive/3.1.0.zip
RUN unzip 3.1.0.zip
  
WORKDIR /opt/opencv/opencv-3.0.0
RUN \
    mkdir build \
    cd build \
    cmake .. \
    make \
    make install \
    make clean

RUN sh -c 'echo "/usr/local/lib" > /etc/ld.so.conf.d/opencv.conf'
RUN ldconfig

## Install MongoDb
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv EA312927
RUN echo "deb http://repo.mongodb.org/apt/ubuntu trusty/mongodb-org/3.2 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-3.2.list
RUN apt-get update && apt-get install -y mongodb-org

## Install Node.js
RUN curl --silent --location https://deb.nodesource.com/setup_6.x | bash -
RUN apt-get install -y nodejs

WORKDIR /opt/node
COPY package.json /opt/node/
RUN npm install
COPY . /opt/node

EXPOSE 3000
CMD [ "npm", "start" ]


